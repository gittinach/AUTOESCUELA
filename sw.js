// Autoescuela · funcionamiento sin conexión
const SCOPE=self.registration.scope;
const PREFIX=`autoescuela:${SCOPE}:`;
const CACHE=PREFIX+'0.11.1';
const FILES=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png',
  'driving.js','driving-world.js','driving-scene.js','driving-audio.js','driving.css','driving-materials.jpg'];
const URLS=new Set(FILES.map(file=>new URL(file,SCOPE).href));

self.addEventListener('install',event=>{
  const files=Array.from(URLS,url=>new Request(url,{cache:'reload'}));
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(files)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(
    names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name))
  )).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  url.search='';
  if(!URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>
    await cache.match(url.href)||fetch(event.request)
  ));
});
