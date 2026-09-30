const CACHE='oxypeak-games-1.2.0';
const FILES=['games.html','games.js','games.css'].map(file=>new URL(file,self.location.href).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('oxypeak-games-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
    // Only these public game files are cached. Never intercept patient APIs or pages.
    if(event.request.method!=='GET'||!FILES.includes(event.request.url))return;
    event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(cached=>cached||fetch(event.request))));
});
