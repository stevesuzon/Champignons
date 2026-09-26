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
    'nwr(around:'+radius+','+lat+','+lon+')[landuse=forest];'+
    'nwr(around:'+radius+','+lat+','+lon+')[natural=wood];'+
    'nwr(around:'+radius+','+lat+','+lon+')[landuse=wood];'+
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


function cleanSpecies(value){
  return String(value||'')
    .replace(/[^a-zA-ZÀ-ÿ0-9 ,;\-\/’']/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,160);
}
function seedFromSpecies(value){
  let h=2166136261;
  const s=String(value||'');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0)%2147483646+1;
}
function mushroomPrompt(species){
  return [
    'Photographie macro professionnelle ultra-réaliste et très nette d’un sol de forêt française humide, lumière naturelle, détails fins, rendu photographique réaliste.',
    'Montrer dans UNE SEULE scène naturelle, sans collage ni montage, toutes les variétés suivantes et uniquement celles-ci : '+species+'.',
    'Chaque variété citée doit être clairement visible et reconnaissable.',
    'Repères visuels à respecter si présents dans la liste : cèpes/bolets = Boletus edulis au chapeau brun et pied épais ; cèpes des pins = Boletus pinophilus ; girolles = Cantharellus cibarius jaune doré ; chanterelles = Craterellus tubaeformis plus petites, jaune-brun ; trompettes de la mort = Craterellus cornucopioides noires en trompette ; lactaires = Lactarius deliciosus orangés.',
    'Ne montrer aucune autre espèce de champignon. Aucun texte, aucune étiquette, aucune interface, aucune main, aucun panier. Composition horizontale adaptée à une fiche d’application.'
  ].join(' ');
}
async function mushroomPhotoResponse(env,species){
  if(!env.AI)return json({ok:false,error:'AI_BINDING_MANQUANT'},503);
  const result=await env.AI.run('@cf/black-forest-labs/flux-1-schnell',{
    prompt:mushroomPrompt(species),
    steps:8,
    seed:seedFromSpecies(species)
  });
  if(!result||!result.image)return json({ok:false,error:'IMAGE_NON_GENEREE'},502);
  const binary=atob(result.image);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new Response(bytes,{status:200,headers:{
    'content-type':'image/jpeg',
    'cache-control':'public, max-age=604800, s-maxage=604800',
    'access-control-allow-origin':'*',
    'x-content-type-options':'nosniff'
  }});
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/mushroom-photo'&&request.method==='GET'){
      const species=cleanSpecies(url.searchParams.get('species'));
      if(!species)return json({ok:false,error:'VARIETES_MANQUANTES'},400);
      const cache=caches.default;
      const key=new Request(url.origin+'/api/mushroom-photo-cache?species='+encodeURIComponent(species.toLowerCase()));
      const cached=await cache.match(key);
      if(cached)return cached;
      try{
        const response=await mushroomPhotoResponse(env,species);
        if(response.ok)await cache.put(key,response.clone());
        return response;
      }catch(e){
        return json({ok:false,error:'GENERATION_IMAGE_IMPOSSIBLE',message:String(e&&e.message||e)},502);
      }
    }
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
