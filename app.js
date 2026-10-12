const $=id=>document.getElementById(id),video=$('video'),subtitle=$('subtitle'),status=$('status');let cues=[],blobUrl=null,manual=false;
function message(s){status.textContent=s}
function parseTime(s){let m=s.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);if(!m)return NaN;return (+m[1]||0)*3600+(+m[2])*60+(+m[3])+(+m[4].padEnd(3,'0').slice(0,3))/1000}
function parseSubs(s){return s.replace(/\r/g,'').replace(/^WEBVTT[^\n]*\n/,'').split(/\n\s*\n/).flatMap(block=>{let lines=block.trim().split('\n'),i=lines.findIndex(x=>x.includes('-->'));if(i<0)return[];let [a,b]=lines[i].split('-->');let start=parseTime(a),end=parseTime(b);return Number.isFinite(start)&&Number.isFinite(end)?[{start,end,text:lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'')}]:[]}).sort((a,b)=>a.start-b.start)}
video.addEventListener('timeupdate',()=>{if(manual)return;let t=video.currentTime,c=cues.find(x=>t>=x.start&&t<x.end);subtitle.textContent=c?c.text:''});
$('load').onclick=()=>{let url=$('url').value.trim();if(!/^https:\/\//i.test(url)){message('HTTPS ile başlayan doğrudan video bağlantısı gir.');return}if(blobUrl){URL.revokeObjectURL(blobUrl);blobUrl=null}video.src=url;video.load();message('Video yükleniyor. Site izin vermiyorsa oynatılamaz.')};
$('file').onchange=e=>{let f=e.target.files[0];if(!f)return;if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(f);video.src=blobUrl;video.load();message('Yerel video seçildi.')};
$('srt').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{cues=parseSubs(await f.text());manual=false;subtitle.textContent='';message(cues.length+' altyazı satırı yüklendi.')}catch{message('Altyazı okunamadı.')}};
$('show').onclick=()=>{manual=true;subtitle.textContent=$('manual').value;message('Örnek metin gösteriliyor.')};
$('sample').onclick=()=>{manual=true;subtitle.textContent='Merhaba! Türkçe altyazı burada görünecek.'};
function setCinema(on){document.body.classList.toggle('cinema',on);$('fullscreen').textContent=on?'Sinema Modundan Çık':'Sinema Modu';message(on?'Sinema Modu açık. Yerel video tam ekran düğmesine basmayın.':'Sinema Modu kapalı.')} 
$('fullscreen').onclick=()=>setCinema(!document.body.classList.contains('cinema'));
$('exitCinema').onclick=()=>setCinema(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')setCinema(false)});
video.addEventListener('error',()=>message('Video oynatılamadı. Kaynak adresi, format veya site erişim izni engel olabilir.'));
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
async function translateEnglish(text){
 const T=window.Translator;
 if(!T){$('turkishText').textContent='Bu Safari sürümünde yerleşik Translator API yok; otomatik çeviri yapılamıyor.';logEvent('Ceviri destegi yok','Translator API');return;}
 try{
  if(!translator){
   if(typeof T.availability==='function'){
    const a=await T.availability({sourceLanguage:'en',targetLanguage:'tr'});
    if(a==='unavailable'){throw new Error('İngilizce-Türkçe çeviri paketi desteklenmiyor');}
   }
   translator=await T.create({sourceLanguage:'en',targetLanguage:'tr'});
  }
  $('turkishText').textContent=await translator.translate(text);
  subtitle.textContent=$('turkishText').textContent;manual=true;
  logEvent('Ceviri tamamlandi');
 }catch(err){$('turkishText').textContent='Çeviri kullanılamıyor: '+err.message;logEvent('Ceviri hatasi',err.message);}
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
