const $=id=>document.getElementById(id),video=$('video'),subtitle=$('subtitle'),status=$('status');let cues=[],blobUrl=null,manual=false;
function message(s){status.textContent=s}
function parseTime(s){let m=s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);if(!m)return NaN;return (+m[1]||0)*3600+(+m[2])*60+(+m[3])+(+m[4].padEnd(3,'0').slice(0,3))/1000}
function parseSubs(s){return s.replace(/\r/g,'').replace(/^WEBVTT[^\n]*\n/,'').split(/\n\s*\n/).flatMap(block=>{let lines=block.trim().split('\n'),i=lines.findIndex(x=>x.includes('-->'));if(i<0)return[];let [a,b]=lines[i].split('-->');let start=parseTime(a),end=parseTime(b);return Number.isFinite(start)&&Number.isFinite(end)?[{start,end,text:lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'')}]:[]}).sort((a,b)=>a.start-b.start)}
video.addEventListener('timeupdate',()=>{if(manual)return;let t=video.currentTime,c=cues.find(x=>t>=x.start&&t<x.end);subtitle.textContent=c?c.text:''});
// Tek adres kutusu: güvenli sınıflandırma, izinli HTML keşfi ve gömme denemesi.
function classifySource(raw){
 let u;try{u=new URL(raw)}catch{return {type:'invalid',detail:'Geçerli bir HTTPS bağlantısı gir.'}};
 if(u.protocol!=='https:')return {type:'invalid',detail:'Yalnızca HTTPS bağlantıları kabul edilir.'};
 const path=u.pathname.toLowerCase();
 if(/\.m3u8$/i.test(path))return {type:'hls',detail:'HLS akışı: iPhone Safari oynatmayı deneyebilir.'};
 if(/\.mpd$/i.test(path))return {type:'dash',detail:'DASH (.mpd): iPhone Safari video öğesiyle doğrudan oynatma garantisi yok; HLS alternatifi gerekli olabilir.'};
 if(/\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(path))return {type:'media',detail:'Doğrudan medya adresi: sunucu ve biçim desteğine bağlı.'};
 if(u.hostname.endsWith('.cdn.ampproject.org'))return {type:'amp',detail:'Google AMP önbellek sayfası. Kaynak sitenin gerçek bağlantısını Safari paylaş menüsünden almayı dene.'};
 return {type:'page',detail:'Web sayfası veya uzantısız bağlantı. İzinli kaynak taraması denenebilir; uzantısız gerçek video URL’si de olabilir.'};
}
let activeSourceKind='', lastUrl='', candidateUrls=[];
function setCandidates(urls){
 candidateUrls=[...new Set(urls)].filter(x=>{try{return new URL(x).protocol==='https:'}catch{return false}}).slice(0,15);
 const area=$('sourceCandidates');area.replaceChildren();area.style.display='block';
 if(!candidateUrls.length){area.textContent='Erişilebilir medya kaynağı bulunamadı.';return;}
 area.append(document.createTextNode(candidateUrls.length+' aday medya bağlantısı bulundu (oynatılabilirlik garanti değil):'));
 candidateUrls.forEach((u,i)=>{const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Kaynağı dene '+(i+1)+' · '+new URL(u).hostname;b.onclick=()=>{$('url').value=u;$('load').click()};area.append(document.createElement('div')).append(b)});
}
function loadVideo(raw,kind){
 if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}
 if(audioCtx)stopMeter();
 activeSourceKind=kind;video.removeAttribute('crossorigin');video.src=raw;video.load();
 message('Kaynak yüklendi; video üzerindeki oynat düğmesine bas.');
 logEvent('Video baglantisi yuklendi',kind+' | '+new URL(raw).hostname);
}
$('load').onclick=()=>{
 const raw=$('url').value.trim(),result=classifySource(raw);lastUrl=raw;
 $('sourceType').textContent=result.detail;
 $('openPage').style.display=['page','amp','dash'].includes(result.type)?'inline-block':'none';
 $('inspectPage').style.display=['page','amp'].includes(result.type)?'inline-block':'none';
 $('embedPage').style.display=['page','amp'].includes(result.type)?'inline-block':'none';
 $('sourceCandidates').style.display='none';
 if(result.type==='invalid'){message(result.detail);logEvent('Gecersiz baglanti',result.detail);return}
 if(result.type==='dash'){message('DASH akışı bu oynatıcıda doğrudan desteklenmeyebilir. HLS (.m3u8) alternatifi ara.');logEvent('DASH destegi belirsiz');return}
 if(result.type==='page'||result.type==='amp'){
  message('Bu bir web sayfası. “İzinli kaynakları tara” veya “Sayfayı gömmeyi dene” seçeneğini kullan.');
  logEvent('Sayfa adresi algilandi',new URL(raw).hostname);return;
 }
 loadVideo(raw,result.type);
};
$('openPage').onclick=()=>{try{const u=new URL(lastUrl);if(u.protocol==='https:')window.open(u.href,'_blank','noopener,noreferrer')}catch{}};
$('inspectPage').onclick=async()=>{
 const raw=lastUrl,result=classifySource(raw);
 if(!['page','amp'].includes(result.type))return;
 message('Sayfa taranıyor; yalnızca CORS izni olan siteler okunabilir.');logEvent('Izinli sayfa taramasi',new URL(raw).hostname);
 try{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  let response;try{response=await fetch(raw,{mode:'cors',credentials:'omit',signal:controller.signal,redirect:'follow'})}finally{clearTimeout(timer)}
  if(!response.ok)throw Error('HTTP '+response.status);
  const ct=response.headers.get('content-type')||'';
  if(!/text\/html|application\/xhtml\+xml/i.test(ct))throw Error('HTML sayfası değil ('+ct+')');
  const html=await response.text();if(html.length>2500000)throw Error('Sayfa çok büyük');
  const doc=new DOMParser().parseFromString(html,'text/html'),base=response.url||raw;
  const urls=[];
  const add=x=>{if(!x)return;try{const u=new URL(x,base);if(u.protocol==='https:'&&/\.(mp4|m4v|mov|webm|m3u8)(?:$|[?#])/i.test(u.href))urls.push(u.href)}catch{}};
  doc.querySelectorAll('video[src],video source[src],source[src],meta[property="og:video"],meta[property="og:video:url"],meta[name="twitter:player:stream"],a[href]').forEach(el=>add(el.getAttribute('src')||el.getAttribute('content')||el.getAttribute('href')));
  setCandidates(urls);
  const canonical=doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if(canonical){try{const cu=new URL(canonical,base);if(cu.protocol==='https:'){$('sourceType').textContent+='\nKanonik sayfa: '+cu.href;logEvent('Kanonik adres bulundu',cu.hostname)}}catch{}}
  message(urls.length?'İzinli sayfada medya adayları bulundu.':'Tarama tamamlandı; HTML içinde açık medya adresi bulunamadı.');logEvent('Tarama tamamlandi','aday '+urls.length);
 }catch(err){setCandidates([]);message('Sayfa taranamadı: '+err.message+'. CORS, yönlendirme veya ağ engeli olabilir.');logEvent('Tarama engellendi',err.name+': '+err.message)}
};
$('embedPage').onclick=()=>{const result=classifySource(lastUrl);if(!['page','amp'].includes(result.type))return;$('embeddedPage').src=lastUrl;$('embeddedWrapper').style.display='block';message('Gömme denendi. Site iframe engeli koymuşsa görüntü açılmaz; bu hata JavaScript tarafından her zaman algılanamaz.');logEvent('Iframe denemesi',new URL(lastUrl).hostname)};
$('closeEmbed').onclick=()=>{$('embeddedPage').src='about:blank';$('embeddedWrapper').style.display='none';$('embeddedWrapper').classList.remove('embed-cinema');overlayPause()};
video.addEventListener('loadedmetadata',()=>{message('Video bilgisi alındı. Oynat düğmesine basabilirsin.');logEvent('Video metadata',String(video.videoWidth)+'x'+video.videoHeight)});
video.addEventListener('playing',()=>logEvent('Video oynuyor'));
video.addEventListener('stalled',()=>logEvent('Video veri bekliyor'));
video.addEventListener('error',()=>{
 const codes={1:'Oynatma iptal edildi',2:'Ağ veya sunucu hatası',3:'Video çözümlenemedi',4:'Biçim desteklenmiyor ya da kaynak erişilemiyor'};
 const code=video.error?.code||0,description=codes[code]||'Bilinmeyen hata';
 message('Video açılamadı: '+description+' (kod '+code+').');
 logEvent('Video oynatma hatasi','kod '+code+' | '+description+' | '+activeSourceKind);
});
$('file').onchange=e=>{let f=e.target.files[0];if(!f)return;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(f);video.removeAttribute('crossorigin');video.src=blobUrl;video.load();message('Yerel video seçildi.')};
$('srt').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{cues=parseSubs(await f.text());manual=false;subtitle.textContent='';message(cues.length+' altyazı satırı yüklendi.')}catch{message('Altyazı okunamadı.')}};
$('show').onclick=()=>{manual=true;subtitle.textContent=$('manual').value;message('Örnek metin gösteriliyor.')};
$('sample').onclick=()=>{manual=true;subtitle.textContent='Merhaba! Türkçe altyazı burada görünecek.'};
function setCinema(on){document.body.classList.toggle('cinema',on);$('fullscreen').textContent=on?'Sinema Modundan Çık':'Sinema Modu';message(on?'Sinema Modu açık. Yerel video tam ekran düğmesine basmayın.':'Sinema Modu kapalı.')} 
$('fullscreen').onclick=()=>setCinema(!document.body.classList.contains('cinema'));
$('exitCinema').onclick=()=>setCinema(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')setCinema(false)});

if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});

// Yalnızca tarayıcı yeteneklerini test eder; ses akışı yakalamaz.
$('audioTest').onclick=async()=>{
 const v=video;
 const isPlaying=!!(v.currentSrc && !v.paused && v.readyState>=2);
 const capture=typeof v.captureStream==='function'||typeof v.webkitCaptureStream==='function';
 const speech=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
 const audio=!!(window.AudioContext||window.webkitAudioContext);
 const source=v.currentSrc||'';
 const local=source.startsWith('blob:');
 const sameOrigin=(()=>{try{return new URL(source).origin===location.origin}catch{return false}})();
 const out=[
  'Video oynuyor: '+(isPlaying?'Evet':'Hayır'),
  'Video kaynağı: '+(local?'Yerel dosya':sameOrigin?'Aynı site':source?'Başka site':'Yok'),
  'Video captureStream API: '+(capture?'Var':'Yok'),
  'Web Audio API: '+(audio?'Var':'Yok'),
  'SpeechRecognition API: '+(speech?'Var':'Yok'),
  'Sonuç: Bu test API desteğini ölçer; sesin gerçekten okunabildiğini veya canlı çevirinin çalışacağını kanıtlamaz.'
 ];
 $('audioResult').textContent=out.join('\n');
 $('audioResult').style.whiteSpace='pre-line';
};


// DiziCevir tek paket: tanilama, video ses seviyesi denemesi ve mikrofon ASR.
const logs=[];
function logEvent(name,detail=''){const s=new Date().toISOString()+' | '+name+(detail?' | '+detail:'');logs.push(s);if(logs.length>100)logs.shift();$('diagnostics').textContent=logs.join('\n');}
logEvent('Uygulama acildi',navigator.userAgent);
let audioCtx=null,analyser=null,sourceNode=null,meterTimer=null;
async function stopMeter(){if(meterTimer){clearInterval(meterTimer);meterTimer=null;}if(audioCtx){try{await audioCtx.close()}catch{}audioCtx=null;}analyser=null;sourceNode=null;logEvent('Ses olcumu durduruldu');}
$('stopAudio').onclick=stopMeter;
// Önceki API destek raporunu koruyarak gerçek sinyal ölçümü dener.
const originalAudioTest=$('audioTest').onclick;
$('audioTest').onclick=async()=>{
 originalAudioTest();
 if(!video.currentSrc || video.paused){logEvent('Ses testi','Video oynatilmiyor');return;}
 if(audioCtx){$('audioResult').textContent+='\nÖlçüm zaten aktif.';return;}
 const AC=window.AudioContext||window.webkitAudioContext;
 if(!AC){$('audioResult').textContent+='\nGerçek ölçüm: Web Audio yok.';logEvent('Ses testi','Web Audio yok');return;}
 try{
  audioCtx=new AC();
  // CORS izinleri yoksa sessiz veri elde edilebilir. Bu yöntem CORS'u aşmaz.
  sourceNode=audioCtx.createMediaElementSource(video);
  analyser=audioCtx.createAnalyser();analyser.fftSize=2048;
  sourceNode.connect(analyser);analyser.connect(audioCtx.destination);
  await audioCtx.resume();
  const samples=new Uint8Array(analyser.fftSize);let peak=0,frames=0;
  meterTimer=setInterval(()=>{
   if(!analyser)return;
   analyser.getByteTimeDomainData(samples);
   let sum=0;for(const s of samples){const v=(s-128)/128;sum+=v*v;}
   const rms=Math.sqrt(sum/samples.length);peak=Math.max(peak,rms);frames++;
   $('audioResult').textContent='Ses ölçümü aktif\nAnlık RMS: '+rms.toFixed(4)+'\nEn yüksek RMS: '+peak.toFixed(4)+'\nÖrnek sayısı: '+frames+'\n0.0000: Sessiz video, CORS engeli veya erişilemeyen ses olabilir.\nNot: Ses seviyesi konuşma tanıma değildir.';
  },350);
  logEvent('Ses olcumu basladi','Kaynak: '+video.currentSrc);
 }catch(err){$('audioResult').textContent+='\nGerçek ses ölçümü başarısız: '+err.name+' '+err.message;logEvent('Ses olcumu hatasi',err.name+': '+err.message);await stopMeter();}
};
let recognition=null,shouldListen=false,translator=null;
let translateSerial=0;
async function translateEnglish(text){
 const serial=++translateSerial;
 $('turkishText').textContent='Çevriliyor…';
 let translated='';
 // Önce cihazda varsa tarayıcı çevirisi: metin harici servise gönderilmez.
 const T=window.Translator;
 if(T){
  try{
   if(!translator){
    if(typeof T.availability==='function'){
     const available=await T.availability({sourceLanguage:'en',targetLanguage:'tr'});
     if(available==='unavailable')throw Error('Dil paketi yok');
    }
    translator=await T.create({sourceLanguage:'en',targetLanguage:'tr'});
   }
   translated=await translator.translate(text);
   logEvent('Yerlesik ceviri tamamlandi');
  }catch(err){logEvent('Yerlesik ceviri kullanilamadi',err.message)}
 }
 if(!translated){
  if(!$('onlineConsent').checked){$('turkishText').textContent='Yerleşik çeviri yok. Harici servis izni verirsen çevirmeyi deneyebiliriz.';return}
  try{
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
   let response;
   try{response=await fetch('https://api.mymemory.translated.net/get?'+new URLSearchParams({q:text.slice(0,450),langpair:'en|tr'}),{signal:controller.signal,mode:'cors',credentials:'omit'})}finally{clearTimeout(timer)}
   if(!response.ok)throw Error('HTTP '+response.status);
   const data=await response.json();
   if(data.responseStatus!==200||!data.responseData?.translatedText)throw Error('Servis çeviri döndürmedi');
   translated=data.responseData.translatedText;
   logEvent('Harici metin cevirisi tamamlandi');
  }catch(err){if(serial===translateSerial)$('turkishText').textContent='Çeviri alınamadı: '+err.message;logEvent('Harici ceviri hatasi',err.message);return}
 }
 if(serial!==translateSerial)return;
 $('turkishText').textContent=translated;
 subtitle.textContent=translated;manual=true;
 // V4'ün gömülü video üzerindeki katmanını da güncelle.
 embedOverlay.textContent=translated;
}
$('startSpeech').onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){$('speechStatus').textContent='Bu tarayıcıda SpeechRecognition yok.';logEvent('Konusma tanima','Desteklenmiyor');return;}
 if(recognition){$('speechStatus').textContent='Dinleme zaten başlatıldı.';return;}
 recognition=new SR();recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;
 shouldListen=true;
 recognition.onstart=()=>{$('speechStatus').textContent='Mikrofon dinleniyor (İngilizce).';logEvent('Mikrofon dinleme basladi')};
 recognition.onresult=e=>{let text='',finalText='';for(let i=e.resultIndex;i<e.results.length;i++){text+=e.results[i][0].transcript+' ';if(e.results[i].isFinal)finalText+=e.results[i][0].transcript+' ';}$('englishText').textContent=text.trim()||'—';if(finalText.trim())translateEnglish(finalText.trim());};
 recognition.onerror=e=>{$('speechStatus').textContent='Konuşma tanıma hatası: '+e.error;logEvent('Konusma tanima hatasi',e.error);if(['not-allowed','service-not-allowed','audio-capture'].includes(e.error))shouldListen=false;};
 recognition.onend=()=>{recognition=null;$('speechStatus').textContent=shouldListen?'Dinleme sona erdi. Yeniden başlatmayı deneyin.':'Dinleme durduruldu.';logEvent('Mikrofon dinleme sona erdi');shouldListen=false;};
 try{recognition.start()}catch(err){recognition=null;shouldListen=false;$('speechStatus').textContent=err.message;logEvent('Baslatma hatasi',err.message)}
};
$('stopSpeech').onclick=()=>{shouldListen=false;if(recognition){try{recognition.stop()}catch{}}};
$('copyLog').onclick=async()=>{const content=logs.join('\n');try{await navigator.clipboard.writeText(content);message('Tanılama kaydı kopyalandı.')}catch{message('Kopyalama engellendi; aşağıdaki tanılama metnini seçip kopyalayın.')}};
window.addEventListener('unhandledrejection',e=>logEvent('Promise hatasi',String(e.reason)));
window.addEventListener('error',e=>logEvent('JS hatasi',e.message));

// V4: Gömülü iframe üzerine yerel altyazı; iframe'in sesine/zamanına erişim iddiası yoktur.
let overlaySeconds=0,overlayRunning=false,overlayLast=0,overlayRAF=0;
const embedOverlay=$('embedOverlay');
function clockFormat(n){const t=Math.max(0,Math.floor(n));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function updateOverlay(){
 const cue=cues.find(x=>overlaySeconds>=x.start&&overlaySeconds<x.end);
 const content=cue?cue.text:(manual?subtitle.textContent:'');
 embedOverlay.textContent=content;
 $('overlayClock').textContent='Altyazı saati: '+clockFormat(overlaySeconds)+(overlayRunning?' · çalışıyor':' · duraklatıldı');
}
function overlayTick(now){
 if(!overlayRunning)return;
 if(overlayLast)overlaySeconds+=(now-overlayLast)/1000;
 overlayLast=now;updateOverlay();overlayRAF=requestAnimationFrame(overlayTick);
}
function overlayPause(){overlayRunning=false;overlayLast=0;if(overlayRAF)cancelAnimationFrame(overlayRAF);overlayRAF=0;updateOverlay()}
$('overlayStart').onclick=()=>{if(overlayRunning)return;overlayRunning=true;overlayLast=0;overlayRAF=requestAnimationFrame(overlayTick);logEvent('Gomulu altyazi basladi')};
$('overlayPause').onclick=()=>{overlayPause();logEvent('Gomulu altyazi duraklatildi')};
$('overlayBack').onclick=()=>{overlaySeconds=Math.max(0,overlaySeconds-2);updateOverlay()};
$('overlayForward').onclick=()=>{overlaySeconds+=2;updateOverlay()};
$('overlayReset').onclick=()=>{overlaySeconds=0;overlayLast=0;updateOverlay()};
$('embedCinema').onclick=()=>{
 const active=$('embeddedWrapper').classList.toggle('embed-cinema');
 $('embedCinema').textContent=active?'Sinema Modundan Çık':'Gömülü Sinema Modu';
 logEvent('Gomulu sinema',active?'acildi':'kapandi');updateOverlay();
};
const originalSrtChange=$('srt').onchange;
$('srt').onchange=async e=>{await originalSrtChange(e);overlayPause();overlaySeconds=0;updateOverlay();logEvent('Gomulu altyazi dosyasi',String(cues.length)+' satir')};
const originalShow=$('show').onclick;
$('show').onclick=()=>{originalShow();updateOverlay()};
const originalSample=$('sample').onclick;
$('sample').onclick=()=>{originalSample();updateOverlay()};
const originalEmbed=$('embedPage').onclick;
$('embedPage').onclick=()=>{originalEmbed();overlayPause();overlaySeconds=0;updateOverlay()};
updateOverlay();

$('quickToggle').onclick=()=>{if(overlayRunning){overlayPause()}else{$('overlayStart').click()}$('quickToggle').textContent=overlayRunning?'⏸ Altyazı':'▶ Altyazı'};
$('quickBack').onclick=()=>{$('overlayBack').click()};
$('quickForward').onclick=()=>{$('overlayForward').click()};
