const CACHE='champignons-standalone-v65';
const SHELL=['./','index.html','champignons.css?v=65','champignons.js?v=65','config.js?v=65','manifest.webmanifest?v=65','icon.svg','assets/entry-bg.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('champignons-standalone-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const u=new URL(event.request.url);if(u.origin!==location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('./',copy)).catch(()=>{});return r}).catch(()=>caches.match('./')));return}event.respondWith(caches.match(event.request).then(cached=>{const fresh=fetch(event.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{})}return r}).catch(()=>cached);return cached||fresh}))});
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let title='🍄 Champignons',body='Nouveau message dans le chat Champignons.',target='./?chat=1',tag='champignons-chat';
    try{
      const sub=await self.registration.pushManager.getSubscription();
      if(sub&&sub.endpoint){
        const r=await fetch('./api/mushrooms/push-pending',{
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({endpoint:sub.endpoint}),
          cache:'no-store'
        });
        const j=await r.json();
        if(r.ok&&j&&j.pending){
          title=j.pending.title||title;
          body=j.pending.body||body;
          target=j.pending.targetUrl||target;
          tag='champignons-chat-'+String(j.pending.id||Date.now())
        }
      }
    }catch(_){}
    await self.registration.showNotification(title,{
      body,
      icon:'icon.svg',
      badge:'icon.svg',
      tag,
      renotify:true,
      vibrate:[200,100,200],
      data:{url:target}
    })
  })())
});
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
