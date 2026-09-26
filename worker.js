const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};

function json(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
}

function clampNumber(v,min,max,fallback){
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

async function queryOverpass(lat,lon,radius,limit){
  const q='[out:json][timeout:15];('+
    'way(around:'+radius+','+lat+','+lon+')[name][landuse=forest];'+
    'relation(around:'+radius+','+lat+','+lon+')[name][landuse=forest];'+
    'way(around:'+radius+','+lat+','+lon+')[name][natural=wood];'+
    'relation(around:'+radius+','+lat+','+lon+')[name][natural=wood];'+
    ');out center tags '+limit+';';
  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  for(const endpoint of endpoints){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),16000);
    try{
      const body='data='+encodeURIComponent(q);
      const r=await fetch(endpoint,{
        method:'POST',
        headers:{
          'content-type':'application/x-www-form-urlencoded;charset=UTF-8',
          'accept':'application/json',
          'user-agent':'Champignons/1.0'
        },
        body,
        signal:ctrl.signal
      });
      clearTimeout(timer);
      if(!r.ok) continue;
      const data=await r.json();
      if(data&&Array.isArray(data.elements)) return data.elements;
    }catch(_){
      clearTimeout(timer);
    }
  }
  return [];
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/forests'&&request.method==='GET'){
      const lat=Number(url.searchParams.get('lat'));
      const lon=Number(url.searchParams.get('lon'));
      if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180){
        return json({ok:false,error:'GPS_INVALIDE'},400);
      }
      const radius=Math.round(clampNumber(url.searchParams.get('radius'),1000,100000,40000));
      const limit=Math.round(clampNumber(url.searchParams.get('limit'),20,300,180));
      const latKey=(Math.round(lat*200)/200).toFixed(3);
      const lonKey=(Math.round(lon*200)/200).toFixed(3);
      const cacheKey=new Request(url.origin+'/api/forests-cache?lat='+latKey+'&lon='+lonKey+'&radius='+radius+'&limit='+limit);
      const cache=caches.default;
      const cached=await cache.match(cacheKey);
      if(cached) return cached;
      const elements=await queryOverpass(lat,lon,radius,limit);
      const response=json({ok:true,elements});
      response.headers.set('cache-control','public, max-age=21600');
      if(elements.length) await cache.put(cacheKey,response.clone());
      return response;
    }
    if(env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found',{status:404});
  }
};
