const CACHE='champignons-standalone-v57';
const SHELL=['./','index.html','champignons.css?v=57','champignons.js?v=57','config.js?v=57','manifest.webmanifest?v=57','icon.svg','assets/entry-bg.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('champignons-standalone-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('./',copy)).catch(()=>{});return r}).catch(()=>caches.match('./')));return}event.respondWith(caches.match(event.request).then(cached=>{const fresh=fetch(event.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{})}return r}).catch(()=>cached);return cached||fresh}))});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=(event.notification&&event.notification.data&&event.notification.data.url)||'./';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){
      if('focus' in client)return client.focus();
    }
    if(clients.openWindow)return clients.openWindow(target);
  }))
});
