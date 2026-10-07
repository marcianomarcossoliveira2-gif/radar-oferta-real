const CACHE="radar-cliente-v5";
const ASSETS=["./","index.html","styles.css?v=5","app.js?v=5","push.js?v=5","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("radar-cliente-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=="GET"||url.origin!==self.location.origin)return;
  if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).catch(async()=>await(await caches.open(CACHE)).match("index.html")));return}
  if(!ASSETS.some(path=>new URL(path,self.registration.scope).href===url.href))return;
  e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));
});
self.addEventListener("push",event=>{
  let data={};try{data=event.data?.json()||{}}catch{}
  event.waitUntil(self.registration.showNotification(String(data.title||"Radar de Oferta Real").slice(0,100),{body:String(data.body||"Confira novas ofertas no Radar.").slice(0,250),icon:"icons/icon-192.png",badge:"icons/icon-192.png",tag:String(data.tag||"radar-ofertas"),data:{url:self.registration.scope}}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
    const target=clients.find(c=>c.url.startsWith(self.registration.scope));if(target)return target.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
