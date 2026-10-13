const CACHE='dizicevir-player-v2';
const ASSETS=['./','./index.html','./app.js','./manifest.webmanifest','./icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('dizicevir-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith('/dizicevir/'))return;
 if(r.mode==='navigate'||/\.(html|js)$/.test(u.pathname)){
  e.respondWith(fetch(r).then(resp=>{if(resp.ok){const copy=resp.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(r,copy)))}return resp}).catch(()=>caches.match(r)));
 }else e.respondWith(caches.match(r).then(c=>c||fetch(r)));
});
