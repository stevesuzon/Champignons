const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"content-type,x-mushroom-access"};

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
async function geocodeAddress(query){
  const q=String(query||'').replace(/\s+/g,' ').trim().slice(0,220);
  if(q.length<3)return [];
  const endpoint='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=fr,be&q='+encodeURIComponent(q);
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(endpoint,{headers:{'accept':'application/json','user-agent':'Champignons/1.0'},signal:ctrl.signal});
    clearTimeout(timer);
    if(!r.ok)return [];
    const rows=await r.json();
    return (Array.isArray(rows)?rows:[]).map(x=>({lat:Number(x.lat),lon:Number(x.lon),displayName:String(x.display_name||''),name:String(x.name||''),type:String(x.type||''),importance:Number(x.importance||0)})).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
  }catch(_){clearTimeout(timer);return []}
}



function cleanText(value,max=180){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max)}
function validWoodId(value){return cleanText(value,220).replace(/[^a-zA-Z0-9:_\-.]/g,'_')}
function reportDayValue(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):new Date().toISOString().slice(0,10)}
function twoWeekCutoff(){return Date.now()-14*24*60*60*1000}
async function ensureVisitSchema(env){
  if(!env.DB)throw new Error('DB_BINDING_MISSING');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mushroom_visit_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,wood_id TEXT NOT NULL,device_id TEXT NOT NULL,reporter_name TEXT NOT NULL,result TEXT NOT NULL,species TEXT,report_day TEXT NOT NULL,reported_at INTEGER NOT NULL,UNIQUE(wood_id,device_id,report_day))`).run();
  try{await env.DB.prepare('ALTER TABLE mushroom_visit_reports ADD COLUMN species TEXT').run()}catch(_){}
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mushroom_visit_wood_date ON mushroom_visit_reports(wood_id,reported_at DESC)').run();
}
async function cleanupVisitReports(env){await env.DB.prepare('DELETE FROM mushroom_visit_reports WHERE reported_at < ?').bind(twoWeekCutoff()).run()}
async function saveVisitReport(request,env){
  await ensureVisitSchema(env);const body=await request.json().catch(()=>({}));
  const woodId=validWoodId(body.woodId||body.id),deviceId=cleanText(body.deviceId,120),reporterName=(cleanText(body.reporterName,60).split(/\s+/)[0]||'').slice(0,40),result=body.result==='found'?'found':body.result==='empty'?'empty':'',species=cleanSpecies(body.species||''),reportDay=reportDayValue(body.reportDay),reportedAt=Date.now();
  if(!woodId||!deviceId||!reporterName||!result)return json({ok:false,error:'PARAMETRES_MANQUANTS'},400);
  await cleanupVisitReports(env);
  await env.DB.prepare(`INSERT INTO mushroom_visit_reports(wood_id,device_id,reporter_name,result,species,report_day,reported_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(wood_id,device_id,report_day) DO UPDATE SET reporter_name=excluded.reporter_name,result=excluded.result,species=excluded.species,reported_at=excluded.reported_at`).bind(woodId,deviceId,reporterName,result,species,reportDay,reportedAt).run();
  return json({ok:true});
}
async function listVisitReports(url,env){
  await ensureVisitSchema(env);await cleanupVisitReports(env);const woodId=validWoodId(url.searchParams.get('woodId')||'');if(!woodId)return json({ok:false,error:'BOIS_MANQUANT'},400);
  const rows=await env.DB.prepare(`SELECT reporter_name AS reporterName,result,species,report_day AS reportDay,reported_at AS reportedAt FROM mushroom_visit_reports WHERE wood_id=? AND reported_at>=? ORDER BY reported_at DESC LIMIT 80`).bind(woodId,twoWeekCutoff()).all();
  return json({ok:true,reports:rows.results||[]});
}
async function recentFoundReports(env){
  await ensureVisitSchema(env);await cleanupVisitReports(env);const since=Date.now()-7*24*60*60*1000;
  const rows=await env.DB.prepare(`SELECT reporter_name AS reporterName,species,report_day AS reportDay,reported_at AS reportedAt FROM mushroom_visit_reports WHERE result='found' AND reported_at>=? ORDER BY reported_at DESC LIMIT 80`).bind(since).all();
  const seen=new Set(),out=[];for(const row of rows.results||[]){const key=String(row.reporterName||'').toLowerCase()+'|'+String(row.species||'').toLowerCase();if(seen.has(key))continue;seen.add(key);out.push(row);if(out.length>=12)break}return json({ok:true,found:out});
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
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(url.pathname==='/api/visits/report'&&request.method==='POST'){try{return await saveVisitReport(request,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/visits'&&request.method==='GET'){try{return await listVisitReports(url,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/visits/recent-found'&&request.method==='GET'){try{return await recentFoundReports(env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
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
    if(url.pathname==='/api/geocode'&&request.method==='GET'){
      const q=String(url.searchParams.get('q')||'').trim();
      if(q.length<3)return json({ok:false,error:'ADRESSE_TROP_COURTE'},400);
      const results=await geocodeAddress(q);
      return json({ok:true,results});
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
