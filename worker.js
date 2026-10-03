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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mushroom_visit_reports (id INTEGER PRIMARY KEY AUTOINCREMENT,wood_id TEXT NOT NULL,device_id TEXT NOT NULL,reporter_name TEXT NOT NULL,result TEXT NOT NULL,species TEXT,latitude REAL,longitude REAL,report_day TEXT NOT NULL,reported_at INTEGER NOT NULL,UNIQUE(wood_id,device_id,report_day))`).run();
  try{await env.DB.prepare('ALTER TABLE mushroom_visit_reports ADD COLUMN species TEXT').run()}catch(_){}
  try{await env.DB.prepare('ALTER TABLE mushroom_visit_reports ADD COLUMN latitude REAL').run()}catch(_){}
  try{await env.DB.prepare('ALTER TABLE mushroom_visit_reports ADD COLUMN longitude REAL').run()}catch(_){}
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mushroom_visit_wood_date ON mushroom_visit_reports(wood_id,reported_at DESC)').run();
}
async function cleanupVisitReports(env){await env.DB.prepare('DELETE FROM mushroom_visit_reports WHERE reported_at < ?').bind(twoWeekCutoff()).run()}
async function saveVisitReport(request,env){
  await ensureVisitSchema(env);const body=await request.json().catch(()=>({}));
  const woodId=validWoodId(body.woodId||body.id),deviceId=cleanText(body.deviceId,120),reporterName=(cleanText(body.reporterName,60).split(/\s+/)[0]||'').slice(0,40),result=body.result==='found'?'found':body.result==='empty'?'empty':'',species=cleanSpecies(body.species||''),latitude=Number(body.latitude),longitude=Number(body.longitude),reportDay=reportDayValue(body.reportDay),reportedAt=Date.now();
  if(!woodId||!deviceId||!reporterName||!result)return json({ok:false,error:'PARAMETRES_MANQUANTS'},400);
  await cleanupVisitReports(env);
  await env.DB.prepare(`INSERT INTO mushroom_visit_reports(wood_id,device_id,reporter_name,result,species,latitude,longitude,report_day,reported_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(wood_id,device_id,report_day) DO UPDATE SET reporter_name=excluded.reporter_name,result=excluded.result,species=excluded.species,latitude=excluded.latitude,longitude=excluded.longitude,reported_at=excluded.reported_at`).bind(woodId,deviceId,reporterName,result,species,Number.isFinite(latitude)?latitude:null,Number.isFinite(longitude)?longitude:null,reportDay,reportedAt).run();
  return json({ok:true});
}
async function listVisitReports(url,env){
  await ensureVisitSchema(env);await cleanupVisitReports(env);const woodId=validWoodId(url.searchParams.get('woodId')||'');if(!woodId)return json({ok:false,error:'BOIS_MANQUANT'},400);
  const rows=await env.DB.prepare(`SELECT reporter_name AS reporterName,result,species,report_day AS reportDay,reported_at AS reportedAt FROM mushroom_visit_reports WHERE wood_id=? AND reported_at>=? ORDER BY reported_at DESC LIMIT 80`).bind(woodId,twoWeekCutoff()).all();
  return json({ok:true,reports:rows.results||[]});
}
async function recentFoundReports(url,env){
  await ensureVisitSchema(env);await cleanupVisitReports(env);const since=Date.now()-7*24*60*60*1000,lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon')),radius=Math.max(10,Math.min(150,Number(url.searchParams.get('radius')||100)));
  const rows=await env.DB.prepare(`SELECT reporter_name AS reporterName,species,latitude,longitude,report_day AS reportDay,reported_at AS reportedAt FROM mushroom_visit_reports WHERE result='found' AND reported_at>=? ORDER BY reported_at DESC LIMIT 160`).bind(since).all();
  const seen=new Set(),out=[];for(const row of rows.results||[]){if(Number.isFinite(lat)&&Number.isFinite(lon)&&Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))){if(distanceKm(lat,lon,Number(row.latitude),Number(row.longitude))>radius)continue}const key=String(row.reporterName||'').toLowerCase()+'|'+String(row.species||'').toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({reporterName:row.reporterName,species:row.species,reportDay:row.reportDay,reportedAt:row.reportedAt});if(out.length>=12)break}return json({ok:true,found:out});
}


function cleanEmail(value){return cleanText(value,190).toLowerCase()}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value))}
async function ensureMemberSchema(env){
  if(!env.DB)throw new Error('DB_BINDING_MISSING');
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mushroom_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    device_id TEXT,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mushroom_shared_woods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_member_id INTEGER NOT NULL,
    sender_member_id INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    wood_id TEXT NOT NULL,
    wood_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(recipient_member_id,sender_member_id,wood_id)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mushroom_members_seen ON mushroom_members(last_seen DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mushroom_shared_recipient ON mushroom_shared_woods(recipient_member_id,created_at DESC)').run();
}
async function upsertMember(env,body){
  await ensureMemberSchema(env);
  const email=cleanEmail(body&&body.email),firstName=cleanText(body&&body.firstName,80),lastName=cleanText(body&&body.lastName,80),deviceId=cleanText(body&&body.deviceId,120),now=Date.now();
  if(!validEmail(email)||firstName.length<2||lastName.length<2)return null;
  await env.DB.prepare(`INSERT INTO mushroom_members(email,first_name,last_name,device_id,created_at,last_seen,active)
    VALUES(?,?,?,?,?,?,1)
    ON CONFLICT(email) DO UPDATE SET
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      device_id=CASE WHEN excluded.device_id<>'' THEN excluded.device_id ELSE mushroom_members.device_id END,
      last_seen=excluded.last_seen,
      active=1`).bind(email,firstName,lastName,deviceId,now,now).run();
  const row=await env.DB.prepare('SELECT id,email,first_name AS firstName,last_name AS lastName,device_id AS deviceId FROM mushroom_members WHERE email=? LIMIT 1').bind(email).first();
  return row||null;
}
async function handleMembers(request,env){
  const body=await request.json().catch(()=>({})),action=cleanText(body.action,40)||'list';
  const self=await upsertMember(env,body);
  if(!self)return json({ok:false,error:'COMPTE_CHAMPIGNONS_INVALIDE'},400);
  if(action==='register')return json({ok:true,member:{id:self.id,firstName:self.firstName,lastName:self.lastName}});
  if(action==='share_wood')return handleShareBody(body,env,self,'send');
  if(action==='shared_woods')return handleShareBody(body,env,self,'inbox');
  const rows=await env.DB.prepare(`SELECT id,first_name AS firstName,last_name AS lastName
    FROM mushroom_members
    WHERE active=1 AND id<>?
    ORDER BY last_seen DESC,last_name COLLATE NOCASE,first_name COLLATE NOCASE
    LIMIT 300`).bind(self.id).all();
  return json({ok:true,members:rows.results||[]});
}
function sanitizeSharedWood(input){
  const w=input&&typeof input==='object'?input:{},out={
    id:cleanText(w.id,220)||('wood-'+Date.now()),
    woodName:cleanText(w.woodName,140)||'Bois partagé',
    city:cleanText(w.city,120),
    latitude:Number(w.latitude),
    longitude:Number(w.longitude),
    species:cleanText(w.species,180),
    habitat:cleanText(w.habitat,220),
    season:cleanText(w.season,120),
    isPrivate:w.isPrivate===true,
    isHunting:w.isHunting===true,
    privacyStatus:cleanText(w.privacyStatus,30),
    photoUrl:cleanText(w.photoUrl,1200),
    noPhoto:w.noPhoto===true,
    address:cleanText(w.address,260),
    note:cleanText(w.note,500),
    createdAt:w.createdAt||null
  };
  if(!Number.isFinite(out.latitude)||!Number.isFinite(out.longitude))return null;
  return out;
}
async function handleShareBody(body,env,self,forcedAction){
  await ensureMemberSchema(env);
  const action=forcedAction||cleanText(body.action,40);
  if(action==='send'){
    const recipientId=Number(body.recipientId),wood=sanitizeSharedWood(body.wood);
    if(!Number.isFinite(recipientId)||recipientId<=0||!wood)return json({ok:false,error:'DESTINATAIRE_OU_BOIS_INVALIDE'},400);
    const recipient=await env.DB.prepare('SELECT id,first_name AS firstName,last_name AS lastName FROM mushroom_members WHERE id=? AND active=1 LIMIT 1').bind(recipientId).first();
    if(!recipient)return json({ok:false,error:'DESTINATAIRE_INTROUVABLE'},404);
    if(Number(recipient.id)===Number(self.id))return json({ok:false,error:'ENVOI_A_SOI_MEME_INTERDIT'},400);
    const senderName=(cleanText(self.firstName,80)+' '+cleanText(self.lastName,80)).trim();
    await env.DB.prepare(`INSERT INTO mushroom_shared_woods(recipient_member_id,sender_member_id,sender_name,wood_id,wood_json,created_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(recipient_member_id,sender_member_id,wood_id) DO UPDATE SET
        sender_name=excluded.sender_name,wood_json=excluded.wood_json,created_at=excluded.created_at`)
      .bind(recipient.id,self.id,senderName,cleanText(wood.id,220),JSON.stringify(wood),Date.now()).run();
    return json({ok:true,recipient:{id:recipient.id,firstName:recipient.firstName,lastName:recipient.lastName}});
  }
  if(action==='inbox'){
    const rows=await env.DB.prepare(`SELECT id,sender_name AS senderName,wood_json AS woodJson,created_at AS sharedAt
      FROM mushroom_shared_woods WHERE recipient_member_id=? ORDER BY created_at DESC LIMIT 120`).bind(self.id).all();
    const woods=(rows.results||[]).map(r=>{
      let wood=null;try{wood=JSON.parse(r.woodJson||'null')}catch(_){}
      return wood?{shareId:r.id,senderName:r.senderName,sharedAt:r.sharedAt,wood}:null
    }).filter(Boolean);
    return json({ok:true,woods});
  }
  return json({ok:false,error:'ACTION_PARTAGE_INVALIDE'},400);
}
async function handleShare(request,env){
  const body=await request.json().catch(()=>({})),self=await upsertMember(env,body);
  if(!self)return json({ok:false,error:'COMPTE_CHAMPIGNONS_INVALIDE'},400);
  return handleShareBody(body,env,self,cleanText(body.action,40));
}

function distanceKm(a,b,c,d){const R=6371,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(h))}

function csvNumber(v){const n=Number(String(v==null?'':v).replace(',','.'));return Number.isFinite(n)?n:null}
function parseSimpleCsv(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(lines.length<2)return [];
  const sep=lines[0].includes(';')?';':',',heads=lines[0].split(sep).map(x=>x.trim());
  return lines.slice(1).map(line=>{const vals=line.split(sep),o={};heads.forEach((h,i)=>o[h]=vals[i]);return o});
}
async function departmentFromGps(lat,lon){
  try{
    const u='https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon);
    const r=await fetch(u,{headers:{'accept':'application/json','user-agent':'Champignons/1.0'}}),j=await r.json(),pc=String(j&&j.address&&j.address.postcode||'');
    if(/^97[1-6]/.test(pc))return pc.slice(0,3);
    if(/^20/.test(pc))return Number(lat)>42.15?'2B':'2A';
    return /^\d{5}$/.test(pc)?pc.slice(0,2):'';
  }catch(_){return''}
}
async function findMeteoFranceResource(dep){
  const cache=caches.default,key=new Request('https://champignons.local/cache/meteo-resource?dep='+encodeURIComponent(dep)),hit=await cache.match(key);
  if(hit){try{return await hit.json()}catch(_){}}
  const r=await fetch('https://www.data.gouv.fr/api/1/datasets/6569b51ae64326786e4e8e1a/',{headers:{accept:'application/json'}});if(!r.ok)return null;
  const j=await r.json(),resources=Array.isArray(j.resources)?j.resources:[],needle='Q_'+dep+'_latest-';
  const rows=resources.filter(x=>{const z=[x.title,x.description,x.url].map(v=>String(v||'')).join(' ');return z.includes(needle)&&z.includes('RR-T-Vent')&&/\.csv\.gz(?:$|\?)/.test(String(x.url||''))}).sort((a,b)=>String(b.last_modified||b.modified||'').localeCompare(String(a.last_modified||a.modified||'')));
  const out=rows.length?{url:rows[0].url,title:rows[0].title||'',modified:rows[0].last_modified||rows[0].modified||''}:null;
  if(out)await cache.put(key,new Response(JSON.stringify(out),{headers:{'content-type':'application/json','cache-control':'public,max-age=21600'}}));
  return out;
}
async function gunzipText(response){
  try{return await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text()}catch(_){return await response.text()}
}
async function meteoFranceRecent(lat,lon){
  const dep=await departmentFromGps(lat,lon);if(!dep)return null;
  const resource=await findMeteoFranceResource(dep);if(!resource||!resource.url)return null;
  const r=await fetch(resource.url,{cf:{cacheTtl:3600}});if(!r.ok)return null;
  const rows=parseSimpleCsv(await gunzipText(r));if(!rows.length)return null;
  const now=new Date(),cut=Number(new Date(now.getTime()-8*86400000).toISOString().slice(0,10).replace(/-/g,''));
  const recent=rows.filter(x=>Number(x.AAAAMMJJ)>=cut&&Number.isFinite(csvNumber(x.LAT))&&Number.isFinite(csvNumber(x.LON)));if(!recent.length)return null;
  const stationBest=new Map();for(const x of recent){const k=String(x.NUM_POSTE||x.NOM_USUEL||'');if(!k)continue;const d=distanceKm(lat,lon,csvNumber(x.LAT),csvNumber(x.LON));if(!stationBest.has(k)||d<stationBest.get(k).distance)stationBest.set(k,{distance:d,name:String(x.NOM_USUEL||''),lat:csvNumber(x.LAT),lon:csvNumber(x.LON)})}
  const nearest=[...stationBest.entries()].sort((a,b)=>a[1].distance-b[1].distance)[0];if(!nearest)return null;
  const key=nearest[0],station=nearest[1],sr=recent.filter(x=>String(x.NUM_POSTE||x.NOM_USUEL||'')===key).sort((a,b)=>Number(a.AAAAMMJJ)-Number(b.AAAAMMJJ));
  let rain7=0,temps=[];for(const x of sr.slice(-7)){const rr=csvNumber(x.RR);if(rr!=null)rain7+=rr;const tm=csvNumber(x.TM);if(tm!=null)temps.push(tm);else{const tn=csvNumber(x.TN),tx=csvNumber(x.TX);if(tn!=null&&tx!=null)temps.push((tn+tx)/2)}}
  const tempAvg=temps.length?temps.reduce((a,b)=>a+b,0)/temps.length:null,latest=sr[sr.length-1]||{};
  return {source:'Météo-France',department:dep,station:station.name,distanceKm:Number(station.distance.toFixed(1)),rain7:Number(rain7.toFixed(1)),tempAvg:tempAvg==null?null:Number(tempAvg.toFixed(1)),latestDay:String(latest.AAAAMMJJ||''),resourceTitle:resource.title,resourceModified:resource.modified};
}
async function mushroomWeather(url){
  const lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon'));if(!Number.isFinite(lat)||!Number.isFinite(lon))return json({ok:false,error:'GPS_INVALIDE'},400);
  try{const weather=await meteoFranceRecent(lat,lon);if(!weather)return json({ok:false,error:'METEO_FRANCE_INDISPONIBLE'},502);return json({ok:true,weather})}catch(e){return json({ok:false,error:'METEO_FRANCE_INDISPONIBLE',message:String(e&&e.message||e)},502)}
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
    if(url.pathname==='/api/mushrooms/members'&&request.method==='POST'){try{return await handleMembers(request,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/mushrooms/share'&&request.method==='POST'){try{return await handleShare(request,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/visits/report'&&request.method==='POST'){try{return await saveVisitReport(request,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/visits'&&request.method==='GET'){try{return await listVisitReports(url,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/visits/recent-found'&&request.method==='GET'){try{return await recentFoundReports(url,env)}catch(e){return json({ok:false,error:String(e&&e.message||e)},500)}}
    if(url.pathname==='/api/mushroom-weather'&&request.method==='GET')return await mushroomWeather(url);
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
