const CACHE='rumo-pwa-static-v6';
const ASSETS=['./','index.html','cloud.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const req=event.request;const u=new URL(req.url);if(req.method!=='GET'||u.origin!==location.origin)return;event.respondWith((async()=>{try{const res=await fetch(req);if(res.ok&&!u.pathname.includes('/api/')){const c=await caches.open(CACHE);c.put(req,res.clone())}return res}catch{return (await caches.match(req))||Response.error()}})())});
