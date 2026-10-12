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
