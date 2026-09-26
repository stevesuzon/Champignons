(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var API_BASE=String(window.CHAMPIGNONS_CONFIG&&window.CHAMPIGNONS_CONFIG.API_BASE||'').replace(/\/+$/,'');
var COUTEAU_SUISSE_URL=String(window.CHAMPIGNONS_CONFIG&&window.CHAMPIGNONS_CONFIG.COUTEAU_SUISSE_URL||API_BASE||'').replace(/\/+$/,'')+'/';
var MAIN_CODE_KEY='champignons_main_subscription_code_v1';
var IDENTITY_KEY='carplay_app_identity_v240';
var state={gps:null,photo:null,analysis:null,stream:null,accessToken:'',spots:[],lastMode:'nearby',addMode:'add',currentGps:null,browseSection:'public',justImportedSharedWood:false,verifyTargetId:'',shareTargetWood:null,shareMembers:[]};
var FREE_UNTIL_CACHE_KEY='carplay_contest_app_free_until_ms';
var ONBOARDING_KEY='champignons_onboarding_v5';
var CAR_POSITION_KEY='champignons_car_position_v1';
var USER_POSITION_KEY='champignons_user_position_v1';
function cachedTrialUntil(){var ms=0;try{ms=Number(localStorage.getItem(FREE_UNTIL_CACHE_KEY)||0)}catch(_){}return Number.isFinite(ms)&&ms>0?ms:0}
async function syncTrialUntil(){var cached=cachedTrialUntil();try{var r=await fetch(API_BASE+'/api/contest/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId()}),cache:'no-store'}),j=await r.json();var ms=Number(j&&j.appFreeUntil||0);if(r.ok&&ms>0){try{localStorage.setItem(FREE_UNTIL_CACHE_KEY,String(ms))}catch(_){}return ms}}catch(_){}return cached}
function clean(v){return String(v||'').replace(/\s+/g,' ').trim()}
function esc(v){return clean(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function deviceId(){var v=localStorage.getItem('carplay_device_id');if(!v){v=(crypto.randomUUID?crypto.randomUUID():'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem('carplay_device_id',v)}return v}
function identity(){try{if(window.CouteauSuisseGetIdentity){var x=window.CouteauSuisseGetIdentity();if(x)return x}}catch(_){}try{return JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null')}catch(_){return null}}
function saveIdentityLocal(x){var v={firstName:clean(x&&x.firstName),lastName:clean(x&&x.lastName),email:clean(x&&x.email).toLowerCase()};try{localStorage.setItem(IDENTITY_KEY,JSON.stringify(v));if(v.email)localStorage.setItem('carplay_recovery_email',v.email)}catch(_){}return v}
function identityComplete(x){x=x||identity()||{};return clean(x.firstName).length>=2&&clean(x.lastName).length>=2&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(x.email).toLowerCase())}
function identityPlatform(){var ua=navigator.userAgent||'';if(/iphone|ipad|ipod/i.test(ua))return 'ios';if(/android/i.test(ua))return 'android';return 'pwa'}
function subscription(){try{var standalone=clean(localStorage.getItem(MAIN_CODE_KEY)||'');if(standalone)return {code:standalone};return JSON.parse(localStorage.getItem('carplay_shared_subscription')||'null')||{}}catch(_){return {}}}
function accessPayload(extra){var x=identity()||{},s=subscription()||{},trialUntil=cachedTrialUntil();return Object.assign({deviceId:deviceId(),subscriptionCode:clean(s.code||''),email:clean(x.email||s.email||localStorage.getItem('carplay_recovery_email')||''),firstName:clean(x.firstName||s.firstName||''),lastName:clean(x.lastName||s.lastName||''),appFreeUntil:trialUntil||null,trialUntil:trialUntil||null},extra||{})}
function authHeaders(){return {'content-type':'application/json','x-mushroom-access':state.accessToken||''}}
async function ensureMainTrialAccount(){var x=identity()||{},em=clean(x.email||localStorage.getItem('carplay_recovery_email')||'').toLowerCase(),fn=clean(x.firstName||''),ln=clean(x.lastName||'');if(!em||fn.length<2||ln.length<2)return null;try{var r=await fetch(API_BASE+'/api/contest/trial-identity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:em,firstName:fn,lastName:ln}),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(r.ok&&j&&j.expiresAt){var ms=Date.parse(j.expiresAt);if(Number.isFinite(ms)&&ms>Date.now()){try{localStorage.setItem('carplay_personal_trial_until_ms',String(ms))}catch(_){};return ms}}if(j&&j.error==='ABONNEMENT_EXISTANT_A_RECUPERER')return null}catch(_){}return null}

function show(id){['homeView','addView','browseView','woodsListView'].forEach(function(x){var e=$(x);if(e)e.classList.toggle('hidden',x!==id)});var hero=$('homeHero');if(hero)hero.classList.toggle('hidden',id!=='homeView')}
function status(id,msg,kind){var e=$(id);if(!e)return;e.textContent=msg||'';e.classList.remove('ok','bad');if(kind)e.classList.add(kind)}
function haversine(a,b,c,d){var R=6371000,p1=a*Math.PI/180,p2=c*Math.PI/180,dp=(c-a)*Math.PI/180,dl=(d-b)*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function nav(lat,lon){var q=lat+','+lon,p=localStorage.getItem('gps_pref')||'Google Maps';if(p==='Waze')location.href='https://waze.com/ul?ll='+encodeURIComponent(q)+'&navigate=yes';else if(p==='Plans Apple')location.href='https://maps.apple.com/?daddr='+encodeURIComponent(q)+'&dirflg=d';else location.href='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(q)+'&travelmode=driving&dir_action=navigate'}
function carPosition(){try{var p=JSON.parse(localStorage.getItem(CAR_POSITION_KEY)||'null');return p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))?p:null}catch(_){return null}}
function saveCarPosition(p){try{localStorage.setItem(CAR_POSITION_KEY,JSON.stringify(p))}catch(_){}refreshCarButton()}
function refreshCarButton(){var b=$('carBtn'),st=$('carStatus'),p=carPosition();if(!b)return;if(p){b.innerHTML='🚗 RETOURNER À L’AUTO<span>Navigation vers la position exacte enregistrée</span>';if(st){st.disabled=false;st.innerHTML='✅ VOITURE ENREGISTRÉE'+(p.label?'<span>'+esc(p.label)+'</span>':'')+(p.accuracy?'<small>Précision GPS : '+Math.round(Number(p.accuracy))+' m</small>':'')+'<em>Appuyez ici pour effacer cette position</em>'}}else{b.innerHTML='🚗 ENREGISTRER LA VOITURE<span>Mémorise la position GPS exacte de votre auto</span>';if(st){st.disabled=true;st.textContent='Aucun emplacement de voiture enregistré.'}}}
async function recordCarPosition(){var b=$('carBtn'),st=$('carStatus');if(b)b.disabled=true;if(st){st.disabled=true;st.textContent='📍 Recherche de la position GPS exacte de la voiture…'}try{var g=await preciseGps(),label='';try{var rr=await fetch(API_BASE+'/api/place-address?lat='+encodeURIComponent(g.lat)+'&lon='+encodeURIComponent(g.lon),{cache:'no-store'}),jj=await rr.json();if(rr.ok)label=clean(jj.fullAddress||jj.address||jj.name||jj.city||'')}catch(_){}saveCarPosition({lat:g.lat,lon:g.lon,accuracy:g.accuracy,label:label,capturedAt:Date.now()});refreshCarButton()}catch(e){if(st){st.disabled=true;st.textContent='❌ '+(e.message||'Impossible d’enregistrer la voiture.')}}finally{if(b)b.disabled=false}}
async function carAction(){var p=carPosition();if(p){nav(Number(p.lat),Number(p.lon));return}await recordCarPosition()}
function eraseCarPosition(){var p=carPosition();if(!p)return;var where=p.label?'\n\n'+p.label:'';if(!confirm('Voulez-vous vraiment effacer la position enregistrée de la voiture ?'+where))return;try{localStorage.removeItem(CAR_POSITION_KEY)}catch(_){}refreshCarButton()}
function savedUserPosition(){try{var p=JSON.parse(localStorage.getItem(USER_POSITION_KEY)||'null');return p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))?p:null}catch(_){return null}}
function refreshSavedPositionPanel(){
  var p=savedUserPosition(),st=$('savedPositionStatus'),b=$('saveMyPositionBtn'),mv=$('positionMenuValue');
  if(p){
    if(st)st.innerHTML='<b>✅ POSITION BIEN SAUVEGARDÉE</b><span>'+esc(p.address||'Adresse non trouvée')+'</span><small>Précision GPS : '+Math.round(Number(p.accuracy||0))+' m</small>';
    if(b)b.textContent='🔄 ACTUALISER MA POSITION';
    if(mv)mv.textContent='Sauvegardée ›';
    state.currentGps={lat:Number(p.lat),lon:Number(p.lon),accuracy:Number(p.accuracy||0),capturedAt:Number(p.savedAt||0)};
  }else{
    if(st)st.innerHTML='<b>Aucune position sauvegardée.</b><span>Appuyez sur le bouton ci-dessous pour enregistrer votre position GPS.</span>';
    if(b)b.textContent='📍 SAUVEGARDER MA POSITION';
    if(mv)mv.textContent='À enregistrer ›';
  }
}
async function saveOrUpdateMyPosition(){
  var old=savedUserPosition(),b=$('saveMyPositionBtn');
  if(old&&!confirm('Voulez-vous remplacer votre position sauvegardée par votre position actuelle ?'))return;
  if(b)b.disabled=true;
  status('savedPositionStatus','📍 Recherche de votre position GPS précise…');
  try{
    var g=await preciseGps(),address='';
    try{
      var rr=await fetch(API_BASE+'/api/place-address?lat='+encodeURIComponent(g.lat)+'&lon='+encodeURIComponent(g.lon),{cache:'no-store'}),jj=await rr.json();
      if(rr.ok)address=clean(jj.fullAddress||jj.address||jj.name||jj.city||'')
    }catch(_){}
    var p={lat:g.lat,lon:g.lon,accuracy:g.accuracy,address:address||'Position GPS sauvegardée',savedAt:Date.now()};
    localStorage.setItem(USER_POSITION_KEY,JSON.stringify(p));
    state.currentGps={lat:p.lat,lon:p.lon,accuracy:p.accuracy,capturedAt:p.savedAt};
    refreshSavedPositionPanel();
  }catch(e){
    status('savedPositionStatus','❌ '+(e.message||'Impossible de sauvegarder votre position.'),'bad')
  }finally{if(b)b.disabled=false}
}
function cleanActivationCode(v){return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}
function formatActivationCode(v){v=cleanActivationCode(v);return v.length>3?v.slice(0,3)+' '+v.slice(3):v}
function setUnlockGate(open){var g=$('unlockGate');if(!g)return;g.classList.toggle('hidden',!open);g.setAttribute('aria-hidden',open?'false':'true')}
function showUnlockGate(){
  if($('unlockCodeInput'))$('unlockCodeInput').value='';
  status('unlockStatus','Entrez votre nouveau code annuel Champignons. Il est valable 365 jours.');
  setUnlockGate(true);
  setTimeout(function(){try{$('unlockCodeInput').focus()}catch(_){}},100)
}
function requestCodeByEmail(){
  var x=identity()||{},to=clean(window.CHAMPIGNONS_CONFIG&&window.CHAMPIGNONS_CONFIG.ADMIN_EMAIL||''),name=(clean(x.firstName)+' '+clean(x.lastName)).trim(),email=clean(x.email),subject='Demande de code Champignons — 10 € / 1 an',body=['Bonjour,','', 'Je souhaite recevoir un code Champignons valable 1 an au prix de 10 €.', '', 'Nom et prénom : '+(name||'Non renseigné'), 'Adresse e-mail : '+(email||'Non renseignée'), '', 'Merci.'].join('\n'),href='mailto:'+(to?encodeURIComponent(to):'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  location.href=href
}
async function submitUnlockCode(){
  var input=$('unlockCodeInput'),btn=$('unlockSubmitBtn'),code=cleanActivationCode(input&&input.value||'');
  if(code.length!==6){status('unlockStatus','❌ Entrez le code Champignons de 6 caractères.','bad');return}
  if(btn)btn.disabled=true;
  status('unlockStatus','Vérification du code annuel Champignons…');
  try{
    localStorage.setItem(MAIN_CODE_KEY,code);
    state.accessToken='';
    var ok=await checkAccess();
    if(!ok){
      localStorage.removeItem(MAIN_CODE_KEY);
      status('unlockStatus','❌ Code invalide, expiré ou déjà utilisé. Demandez un nouveau code Champignons.','bad');
      return
    }
    status('unlockStatus','✅ Champignons activé pour 365 jours.','ok');
    setTimeout(function(){setUnlockGate(false);show('homeView')},450)
  }catch(e){
    localStorage.removeItem(MAIN_CODE_KEY);
    status('unlockStatus','❌ Impossible de vérifier le code pour le moment.','bad')
  }finally{if(btn)btn.disabled=false}
}
function fmtDate(ms){try{return new Date(Number(ms)).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'})}catch(_){return ''}}
function guide(v){var raw=clean(v),parts=raw.split(/\s*(?:,|;|\+)\s*/).filter(Boolean);if(parts.length>1)return{category:'Plusieurs champignons',season:'Selon les variétés',habitat:'Plusieurs variétés ont été signalées dans ce bois. Consultez la liste de la fiche.'};var n=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(/cepe|bolet/.test(n))return{category:'Cèpes / Bolets',season:'Juin à novembre',habitat:'Chênes, hêtres, châtaigniers et conifères ; sols moussus après la pluie.'};if(/girolle|chanterelle/.test(n))return{category:'Girolles / Chanterelles',season:'Juin à novembre',habitat:'Sous feuillus ou conifères, sols moussus et acides, souvent en groupes.'};if(/trompette/.test(n))return{category:'Trompettes',season:'Août à novembre',habitat:'Sous hêtres et chênes, sols frais, humides et ombragés.'};if(/morille/.test(n))return{category:'Morilles',season:'Mars à mai',habitat:'Lisières, frênes, vieux vergers et certains sols calcaires ou remués.'};if(/pied.*mouton|hydne/.test(n))return{category:'Pieds-de-mouton',season:'Août à décembre',habitat:'Bois de feuillus et conifères, sous feuilles ou aiguilles.'};if(/coulemelle|lepiote/.test(n))return{category:'Coulemelles / Lépiotes',season:'Juillet à novembre',habitat:'Prairies, clairières, lisières et bords de chemins herbeux.'};if(/lactaire/.test(n))return{category:'Lactaires',season:'Juillet à novembre',habitat:'Pins, épicéas, bouleaux ou autres feuillus selon l’espèce.'};if(/russule/.test(n))return{category:'Russules',season:'Juin à novembre',habitat:'Bois de feuillus et de conifères ; habitat variable selon l’espèce.'};if(/amanite/.test(n))return{category:'Amanites',season:'Juin à novembre',habitat:'Bois et lisières sous divers arbres. Identification particulièrement délicate.'};if(/agaric/.test(n))return{category:'Agarics',season:'Mai à novembre',habitat:'Prairies, pelouses, lisières ou sous-bois selon l’espèce.'};if(/coprin/.test(n))return{category:'Coprins',season:'Printemps à automne',habitat:'Pelouses, bords de chemins et terrains riches en matière organique.'};return{category:'Autres champignons',season:'Selon l’espèce et la météo',habitat:'Habitat variable selon l’espèce.'}}
var SPECIES_NAMES=['Cèpe de Bordeaux','Cèpe bronzé','Cèpe d’été','Cèpe des pins','Bolet bai','Bolet orangé','Bolet à pied rouge','Girolle','Chanterelle en tube','Chanterelle cendrée','Trompette-de-la-mort','Morille commune','Morille conique','Pied-de-mouton','Coulemelle','Lactaire délicieux','Lactaire sanguin','Russule charbonnière','Russule verdoyante','Amanite tue-mouches','Amanite phalloïde','Amanite rougissante','Agaric champêtre','Agaric des bois','Coprin chevelu','Pleurote en huître','Pholiote changeante','Mousseron de la Saint-Georges','Tricholome','Clitocybe','Autre champignon'];
function normSpecies(v){return clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function speciesIsUsable(v){var n=normSpecies(v);return !!n&&n!=='champignon non identifie'}
function refreshSaveState(){var b=$('saveSpotBtn');if(!b)return;b.disabled=!(state.gps&&state.photo&&state.analysis&&state.analysis.analysisToken&&speciesIsUsable($('speciesInput').value))}
function showSpeciesMatches(){var box=$('speciesMatches'),raw=String($('speciesInput').value||''),chunks=raw.split(/[,;+]/),q=normSpecies(chunks[chunks.length-1]||'');if(!box)return;if(!q){box.classList.add('hidden');box.innerHTML='';return}var selected=chunks.slice(0,-1).map(clean).filter(Boolean).map(normSpecies);var rows=SPECIES_NAMES.filter(function(name){var n=normSpecies(name);return selected.indexOf(n)<0&&(n.indexOf(q)===0||n.indexOf(q)>0)}).slice(0,8);if(!rows.length){box.classList.add('hidden');box.innerHTML='';return}box.innerHTML=rows.map(function(name){return '<button type="button" class="speciesMatchBtn" data-species="'+esc(name)+'">🍄 '+esc(name)+'</button>'}).join('');box.classList.remove('hidden');Array.from(box.querySelectorAll('.speciesMatchBtn')).forEach(function(b){b.onclick=function(){var now=String($('speciesInput').value||''),parts=now.split(/[,;+]/);parts.pop();var kept=parts.map(clean).filter(Boolean),name=b.dataset.species;if(!kept.some(function(x){return normSpecies(x)===normSpecies(name)}))kept.push(name);$('speciesInput').value=kept.join(', ');box.classList.add('hidden');updateGuide();refreshSaveState()}})}
function updateGuide(){var g=guide($('speciesInput').value);$('speciesGuide').innerHTML='<b>Catégorie : '+esc(g.category)+'</b><br>🗓️ Saison : '+esc(g.season)+'<br>🌲 Où chercher : '+esc(g.habitat)}
function stopCamera(){if(state.stream){state.stream.getTracks().forEach(function(t){try{t.stop()}catch(_){}});state.stream=null}var box=$('cameraBox');if(box)box.classList.remove('open')}
async function preciseGps(){return new Promise(function(resolve,reject){if(!navigator.geolocation)return reject(new Error('GPS indisponible'));var best=null,done=false,start=Date.now(),watch=null;function finish(ok,err){if(done)return;done=true;if(watch!=null)navigator.geolocation.clearWatch(watch);ok?resolve(best):reject(err||new Error('Position trop imprécise'))}watch=navigator.geolocation.watchPosition(function(p){var c=p.coords,x={lat:c.latitude,lon:c.longitude,accuracy:Number(c.accuracy||9999),capturedAt:Date.now()};if(!best||x.accuracy<best.accuracy)best=x;status('gpsStatus','Recherche du meilleur point GPS… précision actuelle : '+Math.round(x.accuracy)+' m');if(best.accuracy<=8)return finish(true);if(Date.now()-start>18000){if(best&&best.accuracy<=35)finish(true);else finish(false,new Error('GPS trop imprécis ('+Math.round(best?best.accuracy:999)+' m).'))}},function(e){finish(false,new Error(e&&e.message||'Localisation refusée'))},{enableHighAccuracy:true,maximumAge:0,timeout:22000});setTimeout(function(){if(!done){if(best&&best.accuracy<=35)finish(true);else finish(false,new Error('GPS trop imprécis.'))}},23000)})}
function compressCanvas(canvas,maxW){var w=canvas.width,h=canvas.height;if(w>maxW){var r=maxW/w,n=document.createElement('canvas');n.width=maxW;n.height=Math.round(h*r);n.getContext('2d').drawImage(canvas,0,0,n.width,n.height);canvas=n}var q=.82,data=canvas.toDataURL('image/jpeg',q);while(data.length>420000&&q>.5){q-=.08;data=canvas.toDataURL('image/jpeg',q)}return data}
async function confirmPhotoPosition(){return new Promise(function(resolve,reject){navigator.geolocation.getCurrentPosition(function(p){resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:Number(p.coords.accuracy||9999),capturedAt:Date.now()})},function(e){reject(e)},{enableHighAccuracy:true,maximumAge:0,timeout:12000})})}
async function checkAccess(){
  var x=identity()||{},hasProfile=identityComplete(x),legacyCode=clean(localStorage.getItem(MAIN_CODE_KEY)||'');
  if(!hasProfile&&!legacyCode){state.accessToken='';if($('identityInfo'))$('identityInfo').textContent='Application Champignons : compte à renseigner dans Réglages.';show('homeView');return false}
  if(hasProfile){
    try{
      var vr=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:clean(x.email).toLowerCase()}),cache:'no-store'}),vj=await vr.json().catch(function(){return {}});
      if(vr.ok&&vj&&vj.verified){if(vj.identity)saveIdentityLocal(vj.identity);if($('accountLinkStatus'))status('accountLinkStatus','✅ Compte lié à Couteau Suisse.','ok')}
      else if(!legacyCode){state.accessToken='';if($('identityInfo'))$('identityInfo').textContent='Application Champignons liée à Couteau Suisse — '+clean(x.firstName)+' '+clean(x.lastName)+' — e-mail à confirmer.';show('homeView');return false}
    }catch(_){if(!legacyCode){state.accessToken='';if($('identityInfo'))$('identityInfo').textContent='Application Champignons liée à Couteau Suisse — vérification en attente.';show('homeView');return false}}
  }
  try{
    var r=await fetch(API_BASE+'/api/mushrooms/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(accessPayload({action:'status'})),cache:'no-store'}),j=await r.json().catch(function(){return {}});
    if(r.ok&&j&&j.ok&&j.active){state.accessToken=j.accessToken||'';var a=j.account||identity()||{};if($('identityInfo'))$('identityInfo').textContent='Application Champignons liée à Couteau Suisse — '+((clean(a.firstName)+' '+clean(a.lastName)).trim()||'compte confirmé');if($('accountLinkStatus'))status('accountLinkStatus','✅ Compte lié à Couteau Suisse.','ok');show('homeView');return true}
    state.accessToken='';if($('identityInfo'))$('identityInfo').textContent=hasProfile?'Application Champignons liée à Couteau Suisse — synchronisation en attente.':'Application Champignons : compte à renseigner dans Réglages.';show('homeView');return false
  }catch(_){state.accessToken='';if($('identityInfo'))$('identityInfo').textContent=hasProfile?'Application Champignons liée à Couteau Suisse — connexion serveur indisponible.':'Application Champignons : compte à renseigner dans Réglages.';show('homeView');return false}
}
async function requireRemoteAccess(){if(state.accessToken)return true;var ok=await checkAccess();if(ok)return true;openMushSettings();status('accountLinkStatus','Renseignez puis liez le même nom, prénom et e-mail que dans Couteau Suisse pour utiliser la synchronisation et la reconnaissance.','bad');return false}
async function analyze(){var ai=$('aiPanel');ai.classList.add('open');status('aiStatus','Analyse du champignon en cours…');$('saveSpotBtn').disabled=true;try{var r=await fetch(API_BASE+'/api/mushrooms/analyze',{method:'POST',headers:authHeaders(),body:JSON.stringify({dataUrl:state.photo.dataUrl,latitude:state.photo.photoLat,longitude:state.photo.photoLon,accuracy:state.photo.photoAccuracy,capturedAt:state.photo.capturedAt}),cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw new Error(j&&j.error==='AUCUN_CHAMPIGNON'?'Photo refusée : il faut photographier un vrai champignon non cueilli, encore en terre.':(j&&j.message)||'Analyse impossible.');state.analysis=j;var detected=clean(j.commonName||j.species||''),conf=Number(j.confidence||0),certain=speciesIsUsable(detected)&&conf>=55;$('speciesInput').value=certain?detected:'';updateGuide();if(certain)status('aiStatus','✅ Champignon reconnu : '+detected+(j.scientificName?' ('+j.scientificName+')':'')+' · confiance '+Math.round(conf)+' %. Vérifiez le nom avant d’enregistrer.','ok');else status('aiStatus','✅ Champignon bien détecté, mais l’espèce n’est pas assez certaine. Tapez 1 ou 2 lettres dans « Quel champignon ? » puis touchez la proposition.','ok');refreshSaveState()}catch(e){state.analysis=null;$('speciesInput').value='';showSpeciesMatches();refreshSaveState();status('aiStatus','❌ '+(e.message||'Photo refusée.'),'bad')}}
function resetAdd(){stopCamera();state.gps=null;state.photo=null;state.analysis=null;$('cameraBtn').disabled=true;$('saveSpotBtn').disabled=true;$('aiPanel').classList.remove('open');$('photoPreview').removeAttribute('src');$('woodNameInput').value='';$('privateWoodInput').checked=false;$('publicWoodInput').checked=false;$('speciesInput').value='';$('spotNote').value='';$('speciesGuide').innerHTML='';status('gpsStatus','Appuyez sur « Localiser le bois ».');status('photoStatus','Localisez d’abord le bois : ce bouton deviendra bleu.');status('saveStatus','');var sm=$('speciesMatches');if(sm){sm.innerHTML='';sm.classList.add('hidden')}}
function setAddMode(mode){state.addMode=mode==='recognize'?'recognize':'add';var recognize=state.addMode==='recognize';var title=$('addViewTitle');if(title)title.textContent=recognize?'Reconnaître un champignon':'Ajouter un bois';['woodNameField','privateWoodField','spotNoteField','saveSpotBtn'].forEach(function(id){var e=$(id);if(e)e.classList.toggle('hidden',recognize)});if(!recognize)$('saveSpotBtn').textContent='✅ ENREGISTRER LE BOIS'}
function openAddMode(mode){resetAdd();setAddMode(mode);show('addView')}
function closeSpotPhoto(){var m=$('spotPhotoModal');if(m)m.classList.add('hidden')}
function openSpotPhoto(src,alt){var m=$('spotPhotoModal');if(!m){m=document.createElement('div');m.id='spotPhotoModal';m.className='spotPhotoModal hidden';m.innerHTML='<button type="button" class="spotPhotoClose" aria-label="Retour">← RETOUR</button><img class="spotPhotoLarge" alt="">';document.body.appendChild(m);m.onclick=function(e){if(e.target===m)closeSpotPhoto()};m.querySelector('.spotPhotoClose').onclick=closeSpotPhoto}var img=m.querySelector('.spotPhotoLarge');img.src=src;img.alt=alt||'';m.classList.remove('hidden')}

var LOCAL_SPOTS_KEY='mushroom_local_spots_v2',CITY_CACHE_KEY='mushroom_city_cache_v1',FOREST_CACHE_KEY='mushroom_forest_cache_v36',FAVORITES_KEY='mushroom_favorite_woods_v1',SHARED_WOODS_KEY='mushroom_shared_woods_v1',WOOD_VERIFY_KEY='mushroom_wood_verifications_v1';
function loadLocalSpots(){try{var a=JSON.parse(localStorage.getItem(LOCAL_SPOTS_KEY)||'[]');return Array.isArray(a)?a:[]}catch(_){return[]}}
function writeLocalSpots(rows){try{localStorage.setItem(LOCAL_SPOTS_KEY,JSON.stringify((rows||[]).slice(0,60)));return true}catch(_){try{var light=(rows||[]).slice(0,40).map(function(s){var x=Object.assign({},s);if(String(x.photoUrl||'').indexOf('data:image/')===0)x.photoUrl='';return x});localStorage.setItem(LOCAL_SPOTS_KEY,JSON.stringify(light));return true}catch(__){return false}}}
function saveLocalSpot(spot){var rows=loadLocalSpots().filter(function(x){return String(x.id)!==String(spot.id)});rows.unshift(spot);writeLocalSpots(rows)}
function updateLocalSpot(spot){if(!spot||!spot.id)return;var rows=loadLocalSpots(),found=false;rows=rows.map(function(x){if(String(x.id)===String(spot.id)){found=true;return Object.assign({},x,spot)}return x});if(!found)rows.unshift(spot);writeLocalSpots(rows)}
function removeLocalSpot(id){writeLocalSpots(loadLocalSpots().filter(function(x){return String(x.id)!==String(id)}))}
function readWoodList(key){try{var a=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(a)?a:[]}catch(_){return[]}}
function writeWoodList(key,rows){try{localStorage.setItem(key,JSON.stringify((rows||[]).slice(0,180)));return true}catch(_){return false}}
function slimWood(s){if(!s)return null;var x={id:String(s.id||('wood-'+Date.now())),woodName:clean(s.woodName||'Bois signalé'),city:clean(s.city||''),latitude:Number(s.latitude),longitude:Number(s.longitude),distanceKm:Number.isFinite(Number(s.distanceKm))?Number(s.distanceKm):null,species:clean(s.species||''),habitat:clean(s.habitat||''),season:clean(s.season||''),isPrivate:s.isPrivate===true?true:s.isPrivate===false?false:null,privacyStatus:clean(s.privacyStatus||''),source:clean(s.source||''),isReferenceForest:!!s.isReferenceForest,photoUrl:generatedCombinationPhoto(s.species)||String(s.photoUrl||''),note:clean(s.note||''),createdAt:s.createdAt||null,localSaved:!!s.localSaved,sharedFrom:clean(s.sharedFrom||s.senderName||'')};if(x.photoUrl.indexOf('data:image/')===0)x.photoUrl='';return x}
function favoriteWoods(){return readWoodList(FAVORITES_KEY)}
function sharedWoods(){return readWoodList(SHARED_WOODS_KEY)}
function favoriteIndex(id){return favoriteWoods().findIndex(function(x){return String(x.id)===String(id)})}
function isFavoriteWood(id){return favoriteIndex(id)>=0}
function toggleFavoriteWood(s){if(!s||!s.id)return;var rows=favoriteWoods(),i=rows.findIndex(function(x){return String(x.id)===String(s.id)});if(i>=0)rows.splice(i,1);else{var x=slimWood(s);x.favoritedAt=Date.now();rows.unshift(x)}writeWoodList(FAVORITES_KEY,rows);if(state.browseSection==='my')showMyWoods();else renderResults(state.spots,state.lastMode)}
function storeSharedWood(s){var x=slimWood(s);if(!x||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude))return false;x.sharedReceived=true;x.sharedAt=Date.now();var rows=sharedWoods().filter(function(v){return String(v.id)!==String(x.id)});rows.unshift(x);return writeWoodList(SHARED_WOODS_KEY,rows)}
function encodeSharedWood(s){try{var x=slimWood(s),raw=JSON.stringify(x),bytes=unescape(encodeURIComponent(raw));return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}catch(_){return''}}
function decodeSharedWood(token){try{var b=String(token||'').replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';var raw=decodeURIComponent(escape(atob(b))),x=JSON.parse(raw);return x&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))?x:null}catch(_){return null}}
function importSharedWoodFromUrl(){
  try{
    var u=new URL(location.href);
    if(u.searchParams.has('wood')){
      u.searchParams.delete('wood');
      history.replaceState(null,'',u.pathname+(u.searchParams.toString()?'?'+u.searchParams.toString():'')+u.hash);
    }
  }catch(_){}
  return false
}
function upgradeSavedWoodPhotos(){
  [LOCAL_SPOTS_KEY,FAVORITES_KEY,SHARED_WOODS_KEY].forEach(function(key){
    try{
      var rows=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(rows))return;
      var changed=false;
      rows=rows.map(function(s){
        var p=generatedCombinationPhoto(s&&s.species);
        if(p&&s.photoUrl!==p){changed=true;return Object.assign({},s,{photoUrl:p})}
        return s
      });
      if(changed)localStorage.setItem(key,JSON.stringify(rows))
    }catch(_){}
  })
}
function woodVerifyMap(){try{return JSON.parse(localStorage.getItem(WOOD_VERIFY_KEY)||'{}')||{}}catch(_){return{}}}
function saveWoodVerifyMap(m){try{localStorage.setItem(WOOD_VERIFY_KEY,JSON.stringify(m||{}))}catch(_){}}
function effectivePrivacy(s){var m=woodVerifyMap(),v=m[String(s&&s.id||'')];if(v==='public'||v==='private')return v;if(s&&s.isPrivate===true)return'private';if(s&&s.isPrivate===false)return'public';var p=clean(s&&s.privacyStatus||'').toLowerCase();return p==='private'?'private':p==='public'?'public':'unknown'}
function filterPublicWoods(rows){return keepNearbyWoods((rows||[]).filter(function(s){return effectivePrivacy(s)!=='private'}))}
function mergeMyWoods(){var map=new Map();function put(s,kind){if(!s||!s.id)return;var x=Object.assign({},s);if(kind==='shared')x.sharedReceived=true;if(kind==='local')x.localSaved=true;var d=localDistanceKm(x);if(d!=null)x.distanceKm=Number(d.toFixed(1));map.set(String(x.id),Object.assign({},map.get(String(x.id))||{},x))}favoriteWoods().forEach(function(s){put(s,'favorite')});sharedWoods().forEach(function(s){put(s,'shared')});loadLocalSpots().forEach(function(s){put(s,'local')});return sortWoods(Array.from(map.values()),'nearby')}
function openWoodChooser(){
  state.browseSection='chooser';
  if($('spotResults'))$('spotResults').innerHTML='';
  status('browseStatus','');
  show('browseView');
}
function setBrowseSection(section){
  state.browseSection=section==='my'?'my':'public';
  var refresh=$('nearbySpotsBtn'),title=$('browseModeTitle'),txt=$('browseModeText'),header=$('woodsListTitle');
  show('woodsListView');
  if(refresh)refresh.classList.toggle('hidden',state.browseSection==='my');
  if(header)header.textContent=state.browseSection==='public'?'🌳 BOIS PUBLICS':'⭐ MES BOIS';
  if(title)title.textContent=state.browseSection==='public'?'Bois publics':'Mes bois';
  if(txt)txt.innerHTML=state.browseSection==='public'?'<b>Tous les bois publics</b> à moins de 100 km, du plus près au plus loin.':'Vos <b>bois favoris</b>, vos bois enregistrés et les <b>bois reçus de vos amis</b>.';
}
function showPublicWoods(){setBrowseSection('public');$('spotResults').innerHTML='';status('browseStatus','Chargement de tous les bois publics à moins de 100 km…');searchSpots('nearby')}
async function showMyWoods(){setBrowseSection('my');status('browseStatus','Synchronisation de « Mes bois »…');await syncIncomingSharedWoods();var rows=mergeMyWoods();renderResults(rows,'nearby');status('browseStatus',rows.length?rows.length+' bois dans « Mes bois ».':'Aucun bois dans « Mes bois ». Ajoutez un favori ou recevez un bois d’une personne inscrite.',rows.length?'ok':'')}
function openVerifyWood(id){state.verifyTargetId=String(id||'');var m=$('verifyWoodModal');if(m)m.classList.remove('hidden')}
function closeVerifyWood(){state.verifyTargetId='';var m=$('verifyWoodModal');if(m)m.classList.add('hidden')}
function applyWoodVerification(value){if(!state.verifyTargetId)return;var m=woodVerifyMap();m[state.verifyTargetId]=value;saveWoodVerifyMap(m);closeVerifyWood();if(state.browseSection==='my')showMyWoods();else renderResults(state.spots,state.lastMode)}

function liveReference(){var p=savedUserPosition();return p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon))?p:null}
function localDistanceKm(s){var p=liveReference(),lat=Number(s&&s.latitude),lon=Number(s&&s.longitude);if(!p||!Number.isFinite(lat)||!Number.isFinite(lon))return null;return haversine(Number(p.lat),Number(p.lon),lat,lon)/1000}
function applyLiveDistances(rows){return (rows||[]).map(function(s){var x=Object.assign({},s),d=localDistanceKm(x);x.distanceKm=d==null?null:Number(d.toFixed(1));return x})}
function keepNearbyWoods(rows){return (rows||[]).filter(function(s){var d=Number(s&&s.distanceKm);if(!Number.isFinite(d)){var calc=localDistanceKm(s);if(calc==null)return false;d=calc;s.distanceKm=Number(calc.toFixed(1))}return d<=100})}
var REFERENCE_MUSHROOM_PHOTOS=[
  {test:/cepe|bolet/,label:'Cèpe / bolet',thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Boletus_edulis_in_moss_and_grass.jpg/330px-Boletus_edulis_in_moss_and_grass.jpg'},
  {test:/girolle/,label:'Girolle',thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Cantharellus_cibarius_2009_G3.jpg/330px-Cantharellus_cibarius_2009_G3.jpg'},
  {test:/trompette/,label:'Trompette-de-la-mort',thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Craterellus_cornucopioides.jpg/330px-Craterellus_cornucopioides.jpg'},
  {test:/lactaire/,label:'Lactaire',thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Lactarius_deliciosus_%2823822564856%29.jpg/330px-Lactarius_deliciosus_%2823822564856%29.jpg'},
  {test:/chanterelle/,label:'Chanterelle',thumb:'https://upload.wikimedia.org/wikipedia/commons/thumb/7/79/Funnel_chanterelle_%281%29.jpg/360px-Funnel_chanterelle_%281%29.jpg'},
  {test:/morille/,label:'Morille',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Morchella.esculenta..001..JPG?width=420'},
  {test:/pied.*mouton|hydne/,label:'Pied-de-mouton',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Hydnum_repandum.jpg?width=420'},
  {test:/coulemelle|lepiote/,label:'Coulemelle',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Macrolepiota-procera.jpg?width=420'},
  {test:/russule/,label:'Russule',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Russula_cyanoxantha_(44290996435).jpg?width=420'},
  {test:/agaric/,label:'Agaric',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Agaricus_campestris.jpg?width=420'},
  {test:/coprin/,label:'Coprin',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Coprinus_comatus.jpg?width=420'},
  {test:/pleurote/,label:'Pleurote',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pleurotus_ostreatus.jpg?width=420'},
  {test:/pholiote/,label:'Pholiote',thumb:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Kuehneromyces_mutabilis.jpg?width=420'}
];
function referenceMushroomPhotos(species){
  var n=normSpecies(species||''),seen={};
  return REFERENCE_MUSHROOM_PHOTOS.filter(function(p){
    if(!p.test.test(n)||seen[p.label])return false;
    seen[p.label]=1;
    return true
  })
}
function generatedCombinationPhoto(species){
  var n=normSpecies(species||''),hasCepe=/(cepe|bolet)/.test(n),hasGirolle=/girolle/.test(n),hasChanterelle=/chanterelle/.test(n),hasTrompette=/trompette/.test(n),hasLactaire=/lactaire/.test(n);
  if(hasCepe&&hasGirolle&&hasTrompette)return 'photos/cepe-girolle-trompette.jpg?v=36';
  if(hasCepe&&hasLactaire&&hasChanterelle)return 'photos/cepes-lactaires-chanterelles.jpg?v=36';
  if(hasCepe&&(hasGirolle||hasChanterelle)&&!hasTrompette&&!hasLactaire)return 'photos/cepes-girolles-chanterelles.jpg?v=36';
  return ''
}
function singleCombinationPhoto(s,idx){
  var generated=generatedCombinationPhoto(s&&s.species);
  if(!generated)return '';
  return '<img class="mushSpotPhoto generatedMushPhoto" src="'+generated+'" alt="'+esc('Photo unique réaliste réunissant toutes les variétés indiquées : '+(s.species||'champignons'))+'" loading="'+(idx<6?'eager':'lazy')+'" decoding="async" fetchpriority="'+(idx<6?'high':'low')+'" tabindex="0" role="button">'
}
function referencePhotoGallery(s,idx){
  var one=singleCombinationPhoto(s,idx);
  if(one)return one;
  var photos=referenceMushroomPhotos(s&&s.species);
  if(photos.length===1)return '<img class="mushSpotPhoto generatedMushPhoto" src="'+esc(photos[0].thumb)+'" alt="'+esc(s.species||photos[0].label)+'" loading="'+(idx<6?'eager':'lazy')+'" decoding="async" fetchpriority="'+(idx<6?'high':'low')+'" tabindex="0" role="button">';
  return '<div class="woodPlaceholder">🍄<small>PHOTO UNIQUE À CRÉER</small></div>'
}
function loadMushroomPhoto(src){return new Promise(function(resolve,reject){var im=new Image();im.crossOrigin='anonymous';im.onload=function(){resolve(im)};im.onerror=reject;im.src=src})}
function drawCoverToCanvas(ctx,img,x,y,w,h,fadeLeft,fadeRight,fadeTop,fadeBottom){
  var t=document.createElement('canvas');t.width=Math.max(1,Math.round(w));t.height=Math.max(1,Math.round(h));var tc=t.getContext('2d'),scale=Math.max(w/img.width,h/img.height),sw=w/scale,sh=h/scale,sx=(img.width-sw)/2,sy=(img.height-sh)/2;tc.drawImage(img,sx,sy,sw,sh,0,0,w,h);
  if(fadeLeft||fadeRight){
    tc.globalCompositeOperation='destination-in';var gx=tc.createLinearGradient(0,0,w,0);
    gx.addColorStop(0,fadeLeft?'rgba(0,0,0,0)':'rgba(0,0,0,1)');
    gx.addColorStop(.16,'rgba(0,0,0,1)');gx.addColorStop(.84,'rgba(0,0,0,1)');
    gx.addColorStop(1,fadeRight?'rgba(0,0,0,0)':'rgba(0,0,0,1)');
    tc.fillStyle=gx;tc.fillRect(0,0,w,h)
  }
  if(fadeTop||fadeBottom){
    tc.globalCompositeOperation='destination-in';var gy=tc.createLinearGradient(0,0,0,h);
    gy.addColorStop(0,fadeTop?'rgba(0,0,0,0)':'rgba(0,0,0,1)');
    gy.addColorStop(.14,'rgba(0,0,0,1)');gy.addColorStop(.86,'rgba(0,0,0,1)');
    gy.addColorStop(1,fadeBottom?'rgba(0,0,0,0)':'rgba(0,0,0,1)');
    tc.fillStyle=gy;tc.fillRect(0,0,w,h)
  }
  ctx.drawImage(t,x,y,w,h)
}
function drawMushroomRow(ctx,imgs,y,rowH,W){
  var n=imgs.length;if(!n)return;
  if(n===1){drawCoverToCanvas(ctx,imgs[0],0,y,W,rowH,false,false,false,false);return}
  var overlap=.18,slotW=Math.ceil(W/(n-(n-1)*overlap)),step=(W-slotW)/(n-1);
  imgs.forEach(function(im,i){drawCoverToCanvas(ctx,im,Math.round(i*step),y,slotW,rowH,i>0,i<n-1,false,false)})
}
async function renderCompositeCanvases(){
  var list=Array.from(document.querySelectorAll('.mushroomCompositeCanvas:not([data-ready])'));
  await Promise.all(list.map(async function(cv){
    cv.dataset.ready='1';
    var urls=[];try{urls=JSON.parse(decodeURIComponent(cv.dataset.photos||''))}catch(_){}
    if(!urls.length)return;
    var imgs=[];for(var i=0;i<urls.length;i++){try{imgs.push(await loadMushroomPhoto(urls[i]))}catch(_){}}
    if(!imgs.length)return;
    var ctx=cv.getContext('2d'),W=cv.width,H=cv.height;ctx.fillStyle='#112418';ctx.fillRect(0,0,W,H);
    if(imgs.length<=3){drawMushroomRow(ctx,imgs,0,H,W);return}
    var split=Math.ceil(imgs.length/2),top=imgs.slice(0,split),bottom=imgs.slice(split),rowH=Math.ceil(H*.54);
    drawMushroomRow(ctx,top,0,rowH,W);
    drawMushroomRow(ctx,bottom,H-rowH,rowH,W);
    var shade=ctx.createLinearGradient(0,H*.42,0,H*.58);shade.addColorStop(0,'rgba(0,0,0,0)');shade.addColorStop(.5,'rgba(17,36,24,.12)');shade.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=shade;ctx.fillRect(0,H*.4,W,H*.2)
  }))
}
function forestProfile(tags){tags=tags||{};var leaf=clean(tags.leaf_type||tags.wood||tags.genus||tags.species||'').toLowerCase();if(/needle|conifer|pin|picea|sapin|abies|cedr/.test(leaf))return{species:'Cèpes des pins, lactaires, chanterelles',photoUrl:'photos/cepes-lactaires-chanterelles.jpg?v=36',habitat:'Sous conifères : pins, sapins et épicéas. Variétés possibles à confirmer sur place.'};if(/broad|decidu|ch[eê]ne|quercus|h[eê]tre|fagus|chataign/.test(leaf))return{species:'Cèpes / bolets, girolles, trompettes',photoUrl:'photos/cepe-girolle-trompette.jpg?v=36',habitat:'Sous feuillus : chênes, hêtres et châtaigniers. Variétés possibles à confirmer sur place.'};return{species:'Cèpes / bolets, girolles, chanterelles',photoUrl:'photos/cepes-girolles-chanterelles.jpg?v=36',habitat:'Forêt mixte ou essence non précisée. Variétés possibles à confirmer sur place.'}}
function forestPrivacy(tags){
  tags=tags||{};
  var access=clean(tags.access||tags.foot||tags.vehicle||tags.motor_vehicle||'').toLowerCase();
  var ownership=clean(tags.ownership||tags.owner_type||tags.operator_type||tags.owner||tags.operator||'').toLowerCase();
  if(/private|privé|prive|no\b/.test(access)||/private|privé|prive/.test(ownership))return'private';
  if(/public|yes|permissive|designated/.test(access)||/public|state|etat|État|commune|municip|department|département|onf|domanial/.test(ownership))return'public';
  return'unknown'
}
function readForestCache(g){
  try{
    var c=JSON.parse(localStorage.getItem(FOREST_CACHE_KEY)||'null');
    if(!c||!Array.isArray(c.rows)||!Number.isFinite(Number(c.lat))||!Number.isFinite(Number(c.lon)))return null;
    if(Date.now()-Number(c.ts||0)>21600000)return null;
    if(haversine(Number(g.lat),Number(g.lon),Number(c.lat),Number(c.lon))>20000)return null;
    return c.rows
  }catch(_){return null}
}
function writeForestCache(g,rows){try{localStorage.setItem(FOREST_CACHE_KEY,JSON.stringify({lat:Number(g.lat),lon:Number(g.lon),ts:Date.now(),rows:(rows||[]).slice(0,160)}))}catch(_){}}
async function fetchForestsRadius(g,radius,limit){
  if(!g||!Number.isFinite(Number(g.lat))||!Number.isFinite(Number(g.lon)))return[];
  var lat=Number(g.lat),lon=Number(g.lon),maxRadius=Math.min(100000,Math.max(1000,Number(radius)||40000));
  try{
    var url='/api/forests?lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&radius='+encodeURIComponent(maxRadius)+'&limit='+encodeURIComponent(Math.min(300,Number(limit)||180));
    var r=await fetch(url,{cache:'no-store'}),j=await r.json();
    if(!r.ok||!j||!j.ok||!Array.isArray(j.elements))return[];
    var seen=new Set(),rows=[];
    (j.elements||[]).forEach(function(e){
      var t=e.tags||{},name=clean(t.name||'');if(!name)return;
      var elat=Number(e.lat!=null?e.lat:e.center&&e.center.lat),elon=Number(e.lon!=null?e.lon:e.center&&e.center.lon);
      if(!Number.isFinite(elat)||!Number.isFinite(elon))return;
      var d=haversine(lat,lon,elat,elon)/1000;if(d>100)return;
      var key=normSpecies(name)+'|'+elat.toFixed(3)+'|'+elon.toFixed(3);if(seen.has(key))return;seen.add(key);
      var p=forestProfile(t),privacy=forestPrivacy(t);
      rows.push({id:'osm-'+e.type+'-'+e.id,woodName:name,city:clean(t['addr:city']||t['addr:place']||t['is_in:city']||''),latitude:elat,longitude:elon,distanceKm:Number(d.toFixed(1)),species:p.species,habitat:p.habitat,season:'Selon météo, sol et essences',category:'Bois / forêt cartographié',source:'osm',isReferenceForest:true,isPrivate:privacy==='private'?true:privacy==='public'?false:null,privacyStatus:privacy,photoUrl:p.photoUrl,note:'Bois cartographié. Les champignons indiqués sont des possibilités liées au type de forêt, pas une présence garantie.'});
    });
    return rows.sort(function(a,b){return a.distanceKm-b.distanceKm})
  }catch(_){return[]}
}
function dedupeForestRows(rows){
  var map=new Map();
  (rows||[]).forEach(function(x){
    var key=normSpecies(clean(x.woodName||''))+'|'+Number(x.latitude).toFixed(3)+'|'+Number(x.longitude).toFixed(3);
    if(!map.has(key))map.set(key,x)
  });
  return Array.from(map.values()).sort(function(a,b){return Number(a.distanceKm||9999)-Number(b.distanceKm||9999)})
}
async function discoverPublicForests(g){
  if(!g||!Number.isFinite(Number(g.lat))||!Number.isFinite(Number(g.lon)))return[];
  var cached=readForestCache(g);
  if(cached&&cached.length)return keepNearbyWoods(cached);
  var near=await fetchForestsRadius(g,40000,120);
  if(near.length){writeForestCache(g,near);return near}
  var wider=await fetchForestsRadius(g,100000,200);
  if(wider.length){writeForestCache(g,wider);return wider}
  return[]
}
async function expandPublicForests(g,baseRows,onUpdate){
  try{
    var rows=dedupeForestRows(baseRows||[]);
    var r100=await fetchForestsRadius(g,100000,180);
    rows=dedupeForestRows(rows.concat(r100));
    if(rows.length&&typeof onUpdate==='function')onUpdate(rows);
    var r150=await fetchForestsRadius(g,150000,220);
    rows=keepNearbyWoods(dedupeForestRows(rows.concat(r150)));
    if(rows.length){writeForestCache(g,rows);if(typeof onUpdate==='function')onUpdate(rows)}
  }catch(_){}
}
function mergeReferenceForests(rows,refs,mode){
  var map=new Map();
  (rows||[]).forEach(function(s){var key=normSpecies(clean(s.woodName||''))+'|'+Number(s.latitude).toFixed(3)+'|'+Number(s.longitude).toFixed(3);map.set(key,s)});
  (refs||[]).forEach(function(s){var name=normSpecies(clean(s.woodName||'')),near=false;for(var v of map.values()){if(normSpecies(clean(v.woodName||''))===name&&haversine(Number(v.latitude),Number(v.longitude),Number(s.latitude),Number(s.longitude))<1500){near=true;break}}if(!near){var key=name+'|'+Number(s.latitude).toFixed(3)+'|'+Number(s.longitude).toFixed(3);map.set(key,s)}});
  return sortWoods(Array.from(map.values()),mode)
}
function sortWoods(rows,mode){return (rows||[]).slice().sort(function(a,b){var da=mode==='route'&&a.detourKm!=null?Number(a.detourKm):Number(a.distanceKm),db=mode==='route'&&b.detourKm!=null?Number(b.detourKm):Number(b.distanceKm);if(!Number.isFinite(da))da=1e9;if(!Number.isFinite(db))db=1e9;if(da!==db)return da-db;return clean(a.city||a.woodName).localeCompare(clean(b.city||b.woodName),'fr')})}
function mergeSpots(serverRows,localRows,mode){var map=new Map();(localRows||[]).forEach(function(s){var x=Object.assign({},s,{localSaved:true});if(x.distanceKm==null){var d=localDistanceKm(x);if(d!=null)x.distanceKm=Number(d.toFixed(1))}map.set(String(x.id),x)});(serverRows||[]).forEach(function(s){var k=String(s.id),old=map.get(k)||{},x=Object.assign({},old,s);if(!x.city&&old.city)x.city=old.city;if(!x.photoUrl&&old.photoUrl)x.photoUrl=old.photoUrl;x.localSaved=!!old.localSaved;map.set(k,x)});return sortWoods(Array.from(map.values()),mode)}
function cityCache(){try{return JSON.parse(localStorage.getItem(CITY_CACHE_KEY)||'{}')||{}}catch(_){return{}}}
function cityKey(s){return Number(s.latitude).toFixed(4)+','+Number(s.longitude).toFixed(4)}
async function resolveWoodCity(s){if(!s||s.city)return s&&s.city||'';var lat=Number(s.latitude),lon=Number(s.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return'';var cache=cityCache(),key=cityKey(s);if(cache[key]){s.city=cache[key];return s.city}try{var r=await fetch(API_BASE+'/api/place-address?lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon),{cache:'no-store'}),j=await r.json();var city=clean(j&&j.city||'');if(!city){var full=clean(j&&j.fullAddress||''),m=full.match(/\b\d{5}\s+([^,]+)/);if(m)city=clean(m[1])}if(!city)city=clean(j&&j.address||j&&j.name||'');if(city){s.city=city;cache[key]=city;try{localStorage.setItem(CITY_CACHE_KEY,JSON.stringify(cache))}catch(_){};if(s.localSaved)updateLocalSpot(s);return city}}catch(_){}return''}
async function resolveVisibleCities(spots){var missing=(spots||[]).filter(function(s){return !clean(s.city)}).slice(0,40);for(var i=0;i<missing.length;i+=4){await Promise.all(missing.slice(i,i+4).map(async function(s){var city=await resolveWoodCity(s),el=document.querySelector('[data-wood-id="'+CSS.escape(String(s.id))+'"] .woodCityBig');if(el&&city)el.textContent='📍 '+city}))}}
function makeLocalThumb(dataUrl){return new Promise(function(resolve){if(!dataUrl)return resolve('');var im=new Image();im.onload=function(){try{var max=320,r=Math.min(1,max/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.width*r));cv.height=Math.max(1,Math.round(im.height*r));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);resolve(cv.toDataURL('image/jpeg',.65))}catch(_){resolve('')}};im.onerror=function(){resolve('')};im.src=dataUrl})}
function closeShareWood(){
  state.shareTargetWood=null;
  var m=$('shareWoodModal');if(m)m.classList.add('hidden');
  if($('shareMemberList'))$('shareMemberList').innerHTML='';
  status('shareMemberStatus','');
}
function shareRecipientPayload(m){
  m=m||{};
  return {
    recipientId:clean(m.id||m.memberId||m.userId||m.user_id||''),
    recipientEmail:clean(m.email||'').toLowerCase(),
    recipientDeviceId:clean(m.deviceId||m.device_id||''),
    recipientFirstName:clean(m.firstName||m.first_name||''),
    recipientLastName:clean(m.lastName||m.last_name||''),
    recipientName:(clean(m.firstName||m.first_name)+' '+clean(m.lastName||m.last_name)).trim()||clean(m.name||'')
  }
}
async function internalShareRequest(kind,payload){
  var attempts=kind==='send'?[
    {path:'/api/mushrooms/share',action:'send'},
    {path:'/api/mushrooms/members',action:'share_wood'},
    {path:'/api/mushrooms/manage',action:'share'}
  ]:[
    {path:'/api/mushrooms/share',action:'inbox'},
    {path:'/api/mushrooms/members',action:'shared_woods'},
    {path:'/api/mushrooms/manage',action:'shared_with_me'}
  ];
  var last=null;
  for(var i=0;i<attempts.length;i++){
    try{
      var a=attempts[i],body=accessPayload(Object.assign({},payload||{},{action:a.action})),r=await fetch(API_BASE+a.path,{method:'POST',headers:authHeaders(),body:JSON.stringify(body),cache:'no-store'}),j=await r.json().catch(function(){return{}});
      last={response:r,data:j};
      if(r.ok&&j&&j.ok)return j
    }catch(_){}
  }
  throw new Error(last&&last.data&&(last.data.message||last.data.error)||'PARTAGE_INTERNE_INDISPONIBLE')
}
async function loadShareMembers(){
  var list=$('shareMemberList');if(list)list.innerHTML='';
  status('shareMemberStatus','Chargement des personnes inscrites…');
  var self=identity()||{},selfEmail=clean(self.email||'').toLowerCase();
  try{
    var r=await fetch(API_BASE+'/api/mushrooms/members',{method:'POST',headers:authHeaders(),body:JSON.stringify(accessPayload({action:'list'})),cache:'no-store'}),j=await r.json().catch(function(){return{}});
    if(!r.ok||!j||!j.ok||!Array.isArray(j.members))throw new Error('LISTE_INDISPONIBLE');
    var rows=j.members.filter(function(m){
      var em=clean(m&&m.email||'').toLowerCase();
      return !selfEmail||!em||em!==selfEmail
    });
    state.shareMembers=rows;
    if(!rows.length){status('shareMemberStatus','Aucune autre personne inscrite à Champignons pour le moment.','bad');return}
    status('shareMemberStatus','Choisissez la personne à qui envoyer ce bois.','ok');
    if(list)list.innerHTML=rows.map(function(m,i){
      var name=(clean(m.firstName||m.first_name)+' '+clean(m.lastName||m.last_name)).trim()||clean(m.name)||'Membre Champignons';
      return '<button type="button" class="shareMemberBtn" data-member-index="'+i+'"><span class="shareMemberAvatar">🍄</span><span><b>'+esc(name)+'</b><small>Inscrit à Champignons</small></span><strong>ENVOYER ›</strong></button>'
    }).join('');
    Array.from(document.querySelectorAll('.shareMemberBtn')).forEach(function(b){b.onclick=function(){sendWoodToMember(Number(b.dataset.memberIndex),b)}})
  }catch(_){status('shareMemberStatus','Impossible de charger les personnes inscrites pour le moment.','bad')}
}
async function sendWoodToMember(index,button){
  var s=state.shareTargetWood,m=state.shareMembers[index];if(!s||!m)return;
  if(button)button.disabled=true;
  var rec=shareRecipientPayload(m),name=rec.recipientName||'cette personne';
  status('shareMemberStatus','Envoi du bois à '+name+'…');
  try{
    await internalShareRequest('send',Object.assign({},rec,{wood:slimWood(s)}));
    status('shareMemberStatus','✅ Bois envoyé à '+name+'. Il apparaîtra uniquement dans « Mes bois » de son application.','ok');
    setTimeout(closeShareWood,900)
  }catch(e){
    status('shareMemberStatus','❌ Le partage interne n’est pas disponible sur le serveur pour le moment. Aucun lien externe n’a été créé.','bad');
    if(button)button.disabled=false
  }
}
async function syncIncomingSharedWoods(){
  try{
    var j=await internalShareRequest('inbox',{});
    var rows=Array.isArray(j.woods)?j.woods:Array.isArray(j.sharedWoods)?j.sharedWoods:Array.isArray(j.items)?j.items:Array.isArray(j.spots)?j.spots:[];
    rows.forEach(function(item){
      var s=item&&item.wood?item.wood:item;if(!s)return;
      s=Object.assign({},s,{sharedReceived:true,sharedFrom:clean(item.senderName||item.fromName||s.sharedFrom||'')});
      storeSharedWood(s)
    });
    return rows.length
  }catch(_){return 0}
}
function shareWood(s){
  if(!s)return;
  state.shareTargetWood=s;
  var m=$('shareWoodModal');if(m)m.classList.remove('hidden');
  loadShareMembers()
}
function renderResults(spots,mode){
  var input=state.browseSection==='public'?filterPublicWoods(spots||[]):(spots||[]);
  state.spots=sortWoods(input,mode||'nearby');state.lastMode=mode||state.lastMode;
  var c=$('spotResults');if(!state.spots.length){c.innerHTML='<div class="empty">'+(state.browseSection==='my'?'Aucun bois enregistré dans « Mes bois ».':'Aucun bois public correspondant à moins de 100 km.')+'</div>';return}
  c.innerHTML=state.spots.map(function(s,idx){
    var imgLoad=idx<6?'eager':'lazy',imgPriority=idx<6?'high':'low',comboVisual=singleCombinationPhoto(s,idx),visual=comboVisual|| (s.isReferenceForest?referencePhotoGallery(s,idx):(s.photoUrl?'<img class="mushSpotPhoto" src="'+esc(s.photoUrl)+'" alt="'+esc(s.species)+'" loading="'+imgLoad+'" decoding="async" fetchpriority="'+imgPriority+'" tabindex="0" role="button">':'<div class="woodPlaceholder">🌲<small>BOIS ENREGISTRÉ</small></div>')),privacy=effectivePrivacy(s),woodStatus=privacy==='private'?'<span class="woodStatusPrivate">PRIVÉ</span>':privacy==='public'?'<span class="woodStatusPublic">PUBLIC</span>':'',verifyBtn=privacy==='unknown'?'<button class="verifyWood verifyWoodMain" data-id="'+esc(s.id)+'">VÉRIFIER<br><small>PUBLIC OU PRIVÉ ?</small></button>':'',d=Number(s.distanceKm),distance=Number.isFinite(d)?'<span class="woodDistanceBig">🎯 '+d.toFixed(1)+' km</span>':'<span class="woodDistanceBig">🎯 Distance à calculer</span>',detour=(mode==='route'&&s.detourKm!=null)?'<p class="spotMetaStrong">🛣️ Détour : '+Number(s.detourKm).toFixed(1)+' km</p>':'',fav=isFavoriteWood(s.id),favBtn='<button class="favoriteWood '+(fav?'active':'')+'" data-id="'+esc(s.id)+'" aria-label="'+(fav?'Retirer des favoris':'Ajouter aux favoris')+'">'+(fav?'★':'☆')+'</button>',shared=s.sharedReceived?'<span class="sharedWoodBadge">📨 REÇU'+(s.sharedFrom?' DE '+esc(s.sharedFrom).toUpperCase():' D’UN AMI')+'</span>':'',local=s.localSaved?'<span class="localWoodBadge">📱 MON BOIS</span>':'',note=(!s.isReferenceForest&&s.note)?'<p>💬 '+esc(s.note)+'</p>':'';
    return '<article class="spot" data-wood-id="'+esc(s.id)+'">'+favBtn+'<div class="woodCityBig">📍 '+esc(s.city||'Ville en cours de recherche…')+'</div>'+visual+'<div><h4>'+esc(s.woodName||'Bois signalé')+'</h4>'+distance+shared+local+'<div class="woodStatusRow"><span class="woodStatusLabel">🌲 Bois :</span>'+woodStatus+verifyBtn+'</div><div class="woodVarieties"><b>🍄 Variétés dans ce bois :</b><span>'+esc(s.species||'À vérifier')+'</span></div>'+(privacy==='private'?'<p class="privateNotice">⚠️ Bois privé — autorisation du propriétaire obligatoire.</p>':'')+'<p>🗓️ Saison : '+esc(s.season||guide(s.species).season)+'</p><p>🌲 Où chercher : '+esc(s.habitat||guide(s.species).habitat)+'</p>'+(s.createdAt?'<p>📅 Signalé le '+fmtDate(s.createdAt)+'</p>':'')+detour+note+'</div><button class="btn goWood" data-lat="'+Number(s.latitude)+'" data-lon="'+Number(s.longitude)+'">🌲 ALLER À CE BOIS</button><button class="woodShare" data-id="'+esc(s.id)+'">📤 ENVOYER À UNE PERSONNE</button>'+(s.isReferenceForest?'':'<div class="spotActions"><button class="editSpot" data-id="'+esc(s.id)+'">✏️ MODIFIER</button><button class="deleteSpot" data-id="'+esc(s.id)+'">🗑️ DEMANDER LA SUPPRESSION'+(Number(s.deleteVotes||0)?' ('+Number(s.deleteVotes)+'/5)':'')+'</button></div>')+'</article>'
  }).join('');
  Array.from(c.querySelectorAll('.mushSpotPhoto')).forEach(function(img){img.onclick=function(){openSpotPhoto(img.src,img.alt)};img.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();openSpotPhoto(img.src,img.alt)}}});
  Array.from(c.querySelectorAll('.goWood')).forEach(function(b){b.onclick=function(){nav(Number(b.dataset.lat),Number(b.dataset.lon))}});
  Array.from(c.querySelectorAll('.woodShare')).forEach(function(b){b.onclick=function(){shareWood(state.spots.find(function(s){return String(s.id)===String(b.dataset.id)}))}});
  Array.from(c.querySelectorAll('.favoriteWood')).forEach(function(b){b.onclick=function(){toggleFavoriteWood(state.spots.find(function(s){return String(s.id)===String(b.dataset.id)}))}});
  Array.from(c.querySelectorAll('.verifyWood')).forEach(function(b){b.onclick=function(){openVerifyWood(b.dataset.id)}});
  Array.from(c.querySelectorAll('.editSpot')).forEach(function(b){b.onclick=function(){openEdit(b.dataset.id)}});
  Array.from(c.querySelectorAll('.deleteSpot')).forEach(function(b){b.onclick=function(){voteDelete(b.dataset.id)}});
  renderCompositeCanvases();resolveVisibleCities(state.spots)
}

function openEdit(id){var s=state.spots.find(function(x){return String(x.id)===String(id)});if(!s)return;$('editSpotId').value=s.id;$('editWoodName').value=s.woodName||'';$('editSpecies').value=s.species||'';$('editNote').value=s.note||'';$('editPrivate').checked=!!s.isPrivate;$('editPublic').checked=!s.isPrivate;status('editStatus','');$('editSpotModal').classList.remove('hidden')}
async function saveEdit(){var id=$('editSpotId').value,species=clean($('editSpecies').value);if(!species){status('editStatus','Indiquez les champignons signalés.','bad');return}if(!$('editPrivate').checked&&!$('editPublic').checked){status('editStatus','Choisissez Bois public ou Bois privé.','bad');return}var b=$('saveEditBtn');b.disabled=true;try{var woodName=clean($('editWoodName').value),note=clean($('editNote').value),isPrivate=$('editPrivate').checked,r=await fetch(API_BASE+'/api/mushrooms/manage',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'update',id:id,woodName:woodName,species:species,note:note,isPrivate:isPrivate}),cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw j;var local=loadLocalSpots().find(function(x){return String(x.id)===String(id)});if(local){var g=guide(species);updateLocalSpot(Object.assign({},local,{woodName:woodName||'Bois signalé',species:species,note:note,isPrivate:isPrivate,category:g.category,season:g.season,habitat:g.habitat}))}$('editSpotModal').classList.add('hidden');await searchSpots(state.lastMode)}catch(e){status('editStatus','❌ Modification impossible.','bad')}finally{b.disabled=false}}
async function voteDelete(id){if(!confirm('Demander la suppression de ce bois ? Il sera effacé après 5 demandes différentes.'))return;try{var r=await fetch(API_BASE+'/api/mushrooms/manage',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'vote_delete',id:id}),cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw j;if(j.deleted){removeLocalSpot(id);alert('La fiche a reçu 5 demandes différentes et a été supprimée.')}else alert('Demande enregistrée : '+j.votes+'/5.');await searchSpots(state.lastMode)}catch(e){alert('La demande n’a pas pu être enregistrée.')}}
async function searchSpots(mode){
  mode=mode||'nearby';
  var b=$('nearbySpotsBtn');if(b)b.disabled=true;
  status('browseStatus','📍 Lecture de votre position sauvegardée…');
  var g=savedUserPosition();
  if(!g){
    status('browseStatus','❌ Aucune position sauvegardée. Enregistrez votre position dans Réglages > Ma position.','bad');
    if(b)b.disabled=false;
    openMushSettings();openSettingsPanel('positionPanel');
    return
  }
  state.currentGps={lat:Number(g.lat),lon:Number(g.lon),accuracy:Number(g.accuracy||0),capturedAt:Number(g.savedAt||0)};
  var local=loadLocalSpots(),localRows=keepNearbyWoods(applyLiveDistances(mergeSpots([],local,mode)));
  if(localRows.length){renderResults(localRows,mode);status('browseStatus','Chargement des autres bois…','ok')}
  else status('browseStatus','Chargement des bois du plus près au plus loin…');

  var payload={mode:'nearby',currentLat:g.lat,currentLon:g.lon,latitude:g.lat,longitude:g.lon};
  var serverPromise=fetch(API_BASE+'/api/mushrooms/search',{method:'POST',headers:authHeaders(),body:JSON.stringify(payload),cache:'no-store'})
    .then(async function(r){var j=await r.json();if(!r.ok||!j.ok)throw j;return j.spots||[]})
    .catch(function(){return[]});
  var refsPromise=discoverPublicForests(g);

  try{
    var first=await Promise.all([serverPromise,refsPromise]),serverRows=first[0],refs=first[1];
    var all=keepNearbyWoods(applyLiveDistances(mergeSpots(serverRows,local,mode)));
    all=keepNearbyWoods(mergeReferenceForests(all,refs,mode));
    renderResults(all,mode);
    status('browseStatus',all.length?all.length+' bois affiché'+(all.length>1?'s':'')+' — du plus près au plus loin.':'Recherche en cours…','ok');

    expandPublicForests(g,refs,function(expanded){
      var updated=keepNearbyWoods(applyLiveDistances(mergeSpots(serverRows,local,mode)));
      updated=keepNearbyWoods(mergeReferenceForests(updated,expanded,mode));
      renderResults(updated,mode);
      status('browseStatus',updated.length+' bois affiché'+(updated.length>1?'s':'')+' — du plus près au plus loin.','ok')
    });

    if(!all.length){
      var emergency=await fetchForestsRadius(g,30000,100);
      if(emergency.length){
        var fallback=keepNearbyWoods(mergeReferenceForests(localRows,emergency,mode));
        renderResults(fallback,mode);
        status('browseStatus',fallback.length+' bois affiché'+(fallback.length>1?'s':'')+' — chargement des autres bois en cours.','ok');
        expandPublicForests(g,emergency,function(expanded){
          var updated=keepNearbyWoods(mergeReferenceForests(localRows,expanded,mode));
          renderResults(updated,mode);
          status('browseStatus',updated.length+' bois affiché'+(updated.length>1?'s':'')+' — du plus près au plus loin.','ok')
        })
      }else{
        status('browseStatus','Aucun bois chargé pour le moment. Appuyez sur Actualiser les bois pour réessayer.','bad')
      }
    }
  }catch(e){
    if(localRows.length){renderResults(localRows,mode);status('browseStatus','Bois enregistrés affichés. Actualisez pour charger les autres bois.','bad')}
    else{status('browseStatus','Aucun bois chargé pour le moment. Appuyez sur Actualiser les bois pour réessayer.','bad');$('spotResults').innerHTML='<div class="empty">Chargement indisponible pour le moment.</div>'}
  }finally{if(b)b.disabled=false}
}

$('speciesInput').addEventListener('input',function(){updateGuide();showSpeciesMatches();refreshSaveState()});
$('addSpeciesBtn').onclick=function(){var inp=$('speciesInput'),v=clean(inp.value);if(v&&!/[,;+]\s*$/.test(v))inp.value=v+', ';inp.focus();showSpeciesMatches();};
$('saveEditBtn').onclick=saveEdit;$('cancelEditBtn').onclick=function(){$('editSpotModal').classList.add('hidden')};if($('verifyPublicBtn'))$('verifyPublicBtn').onclick=function(){applyWoodVerification('public')};if($('verifyPrivateBtn'))$('verifyPrivateBtn').onclick=function(){applyWoodVerification('private')};if($('cancelVerifyBtn'))$('cancelVerifyBtn').onclick=closeVerifyWood;if($('cancelShareWoodBtn'))$('cancelShareWoodBtn').onclick=closeShareWood;
$('addSpotBtn').onclick=async function(){if(await requireRemoteAccess())openAddMode('add')};$('browseBtn').onclick=openWoodChooser;$('backHome1').onclick=function(){stopCamera();show('homeView')};$('backHome2').onclick=function(){show('homeView')};if($('backToWoodChooser'))$('backToWoodChooser').onclick=openWoodChooser;$('nearbySpotsBtn').onclick=showPublicWoods;if($('publicWoodsTab'))$('publicWoodsTab').onclick=showPublicWoods;if($('myWoodsTab'))$('myWoodsTab').onclick=showMyWoods;
$('locateBtn').onclick=async function(){var b=this;b.disabled=true;status('gpsStatus','Recherche du meilleur point GPS…');try{state.gps=await preciseGps();status('gpsStatus','✅ Bois localisé — précision '+Math.round(state.gps.accuracy)+' m.','ok');$('cameraBtn').disabled=false;status('photoStatus','✅ GPS du bois enregistré. Le bouton est bleu : prenez maintenant la photo du champignon non cueilli sur place.','ok')}catch(e){state.gps=null;$('cameraBtn').disabled=true;status('gpsStatus','❌ '+e.message,'bad')}finally{b.disabled=false}};
$('cameraBtn').onclick=async function(){if(!state.gps)return;try{state.stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:1280}}});$('cameraVideo').srcObject=state.stream;$('cameraBox').classList.add('open');status('photoStatus','Caméra ouverte — photographiez uniquement le champignon non cueilli, encore en terre.')}catch(e){status('photoStatus','❌ Impossible d’ouvrir la caméra. Autorisez la caméra dans les réglages du téléphone.','bad')}};
$('closeCameraBtn').onclick=stopCamera;
$('captureBtn').onclick=async function(){if(!state.stream||!state.gps)return;var b=this;b.disabled=true;try{var p=await confirmPhotoPosition(),dist=haversine(state.gps.lat,state.gps.lon,p.lat,p.lon);if(dist>200)throw new Error('Emplacement refusé : le GPS de la photo est à '+Math.round(dist)+' m. Maximum autorisé : 200 m.');var v=$('cameraVideo'),c=$('cameraCanvas');c.width=v.videoWidth||960;c.height=v.videoHeight||960;c.getContext('2d').drawImage(v,0,0,c.width,c.height);var data=compressCanvas(c,1280);state.photo={dataUrl:data,capturedAt:Date.now(),photoLat:p.lat,photoLon:p.lon,photoAccuracy:p.accuracy,distanceMeters:dist};$('photoPreview').src=data;stopCamera();status('photoStatus','✅ GPS du bois et GPS de la photo concordent : '+Math.round(dist)+' m d’écart. Analyse du champignon en cours…','ok');await analyze()}catch(e){status('photoStatus','❌ '+(e.message||'Photo impossible.'),'bad')}finally{b.disabled=false}};
$('saveSpotBtn').onclick=async function(){var species=clean($('speciesInput').value);if(!state.gps||!state.photo||!state.analysis||!state.analysis.analysisToken){status('saveStatus','GPS, photo en direct et reconnaissance sont obligatoires.','bad');return}if(!speciesIsUsable(species)){status('saveStatus','Choisissez le champignon détecté ou tapez 1 ou 2 lettres pour le sélectionner.','bad');return}if(!$('privateWoodInput').checked&&!$('publicWoodInput').checked){status('saveStatus','Choisissez Bois public ou Bois privé.','bad');return}var b=this;b.disabled=true;status('saveStatus','Enregistrement du bois sur le serveur et sur ce téléphone…');try{var note=clean($('spotNote').value),woodName=clean($('woodNameInput').value),isPrivate=$('privateWoodInput').checked,r=await fetch(API_BASE+'/api/mushrooms/spots',{method:'POST',headers:authHeaders(),body:JSON.stringify({deviceId:deviceId(),latitude:state.gps.lat,longitude:state.gps.lon,accuracy:state.gps.accuracy,photoLatitude:state.photo.photoLat,photoLongitude:state.photo.photoLon,photoAccuracy:state.photo.photoAccuracy,photoDataUrl:state.photo.dataUrl,analysisToken:state.analysis.analysisToken,woodName:woodName,isPrivate:isPrivate,species:species,note:note}),cache:'no-store'}),j=await r.json();if(!r.ok||!j.ok)throw new Error((j&&j.message)||'Enregistrement impossible.');var thumb=await makeLocalThumb(state.photo.dataUrl),g=guide(species),localSpot=Object.assign({},j.spot||{},{woodName:(j.spot&&j.spot.woodName)||woodName||'Bois signalé',species:species,note:note,isPrivate:isPrivate,latitude:state.gps.lat,longitude:state.gps.lon,category:g.category,season:g.season,habitat:g.habitat,source:'community',photoUrl:generatedCombinationPhoto(species)||thumb,localSaved:true,createdAt:(j.spot&&j.spot.createdAt)||Date.now()});var d=localDistanceKm(localSpot);if(d!=null)localSpot.distanceKm=Number(d.toFixed(1));await resolveWoodCity(localSpot);saveLocalSpot(localSpot);var fuel=j.contestFuel||null,parts=['✅ Bois enregistré sur le serveur et sur ce téléphone. Il apparaît maintenant dans « Retourner dans le bois ».'];if(j.contestAutoAwarded){parts.push('🏆 +'+Number(j.contestPoints||50).toFixed(2).replace('.',',')+' points ajoutés automatiquement.');if(fuel){parts.push('🚗 Trajet aller : '+Number(fuel.distanceKm||0).toFixed(2).replace('.',',')+' km');parts.push('⛽ Litres utilisés : '+Number(fuel.liters||0).toFixed(2).replace('.',',')+' L');parts.push('💶 Coût du gasoil : '+Number(fuel.costEuro||0).toFixed(2).replace('.',',')+' €')}}status('saveStatus',parts.join('\n'),'ok');setTimeout(function(){$('spotResults').innerHTML='';showMyWoods()},1100)}catch(e){status('saveStatus','❌ '+e.message,'bad')}finally{b.disabled=false}};
function isStandaloneApp(){return !!(window.navigator.standalone||window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)}
var deferredInstallPrompt=null;
function openInstallHelp(){
  var box=$('installHelp'),txt=$('installHelpText');if(!box||!txt)return;
  var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  txt.innerHTML=ios?'<b>Sur iPhone / iPad :</b><br>1. Touchez le bouton Partager de Safari.<br>2. Choisissez « Sur l’écran d’accueil ».<br>3. Touchez « Ajouter ».<br><br>Ensuite, ouvrez directement l’icône 🍄 Champignons.':'<b>Installation :</b><br>Utilisez le bouton « Installer » proposé par votre navigateur. Ensuite l’application Champignons aura sa propre icône.';
  box.classList.remove('hidden');box.setAttribute('aria-hidden','false');
}
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredInstallPrompt=e});
async function installStandalone(){
  if(isStandaloneApp()){alert('✅ L’application Champignons est déjà ouverte en mode application.');return}
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch(_){}deferredInstallPrompt=null;return}
  openInstallHelp();
}
function refreshGpsPref(){
  var pref=localStorage.getItem('gps_pref')||'Google Maps',st=$('gpsPrefStatus'),mv=$('gpsMenuValue');if(st)st.textContent='GPS choisi : '+pref;if(mv)mv.textContent=pref+' ›';
  Array.from(document.querySelectorAll('[data-gps]')).forEach(function(b){b.classList.toggle('selected',b.dataset.gps===pref)});
}
async function refreshReturnPlaceStatus(){
  var st=$('returnPlaceStatus');if(!st)return;
  st.textContent='Vérification du point enregistré…';
  try{
    var r=await fetch(API_BASE+'/api/contest/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(accessPayload({})),cache:'no-store'}),j=await r.json();
    var p=j&&j.participant;
    if(r.ok&&p&&Number.isFinite(Number(p.return_place_lat))&&Number.isFinite(Number(p.return_place_lon))){
      st.textContent='✅ Point enregistré : '+clean(p.return_place_label||'Retourner sur la place');
      return;
    }
  }catch(_){}
  st.textContent='Aucun point « Retourner sur la place » enregistré sur le compte.';
}
async function saveReturnPlace(){
  var b=$('saveReturnPlaceBtn');if(!b)return;b.disabled=true;status('returnPlaceStatus','Recherche de votre position précise…');
  try{
    var g=await preciseGps(),label='';
    try{var rr=await fetch(API_BASE+'/api/place-address?lat='+encodeURIComponent(g.lat)+'&lon='+encodeURIComponent(g.lon),{cache:'no-store'}),jj=await rr.json();if(rr.ok)label=clean(jj.address||jj.name||'')}catch(_){}
    localStorage.setItem('return_lat',String(g.lat));localStorage.setItem('return_lon',String(g.lon));if(label)localStorage.setItem('return_address',label);
    var r=await fetch(API_BASE+'/api/contest/home-place',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(accessPayload({lat:g.lat,lon:g.lon,address:label||'Emplacement enregistré',deviceType:'phone'})),cache:'no-store'}),j=await r.json().catch(function(){return{}});
    if(!r.ok)throw new Error(j.error||'Enregistrement impossible');
    status('returnPlaceStatus','✅ '+clean(j.address||label||'Point de retour enregistré.'),'ok');
  }catch(e){status('returnPlaceStatus','❌ '+(e.message||'Impossible d’enregistrer la place.'),'bad')}
  finally{b.disabled=false}
}
var accountWatchTimer=null;
function fillAccountFields(){var x=identity()||{};if($('accountLastName'))$('accountLastName').value=clean(x.lastName);if($('accountFirstName'))$('accountFirstName').value=clean(x.firstName);if($('accountEmail'))$('accountEmail').value=clean(x.email||localStorage.getItem('carplay_recovery_email')||'')}
async function refreshAccountLinkStatus(silent){var x=identity()||{};if(!identityComplete(x)){if(!silent)status('accountLinkStatus','Renseignez le nom, le prénom et l’adresse e-mail utilisés dans Couteau Suisse.');return false}try{var r=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:clean(x.email).toLowerCase()}),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(r.ok&&j&&j.verified){if(j.identity)saveIdentityLocal(j.identity);status('accountLinkStatus','✅ Compte lié à Couteau Suisse.','ok');if(accountWatchTimer){clearInterval(accountWatchTimer);accountWatchTimer=null}await checkAccess();return true}if(!silent)status('accountLinkStatus','📧 Coordonnées enregistrées. L’adresse e-mail doit encore être confirmée pour lier le compte.');return false}catch(_){if(!silent)status('accountLinkStatus','Coordonnées enregistrées sur ce téléphone. Vérification Couteau Suisse indisponible pour le moment.','bad');return false}}
function startAccountWatch(){if(accountWatchTimer)clearInterval(accountWatchTimer);var left=75;accountWatchTimer=setInterval(async function(){left--;var ok=await refreshAccountLinkStatus(true);if(ok||left<=0){clearInterval(accountWatchTimer);accountWatchTimer=null}},4000)}
async function saveCouteauAccount(){var last=clean($('accountLastName').value),first=clean($('accountFirstName').value),email=clean($('accountEmail').value).toLowerCase();if(last.length<2||first.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status('accountLinkStatus','❌ Nom, prénom et adresse e-mail valide sont obligatoires.','bad');return}var x=saveIdentityLocal({lastName:last,firstName:first,email:email}),b=$('saveCouteauAccountBtn');b.disabled=true;status('accountLinkStatus','Enregistrement et liaison avec Couteau Suisse…');try{var sr=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:email}),cache:'no-store'}),sj=await sr.json().catch(function(){return {}});if(sr.ok&&sj&&sj.verified){await fetch(API_BASE+'/api/app-identity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),platform:identityPlatform(),firstName:first,lastName:last,email:email}),cache:'no-store'}).catch(function(){});status('accountLinkStatus','✅ Compte lié à Couteau Suisse.','ok');await checkAccess();return}var r=await fetch(API_BASE+'/api/app-identity/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),platform:identityPlatform(),firstName:first,lastName:last,email:email}),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(!r.ok||!j.ok)throw j;if(j.alreadyVerified){if(j.identity)saveIdentityLocal(j.identity);status('accountLinkStatus','✅ Compte lié à Couteau Suisse.','ok');await checkAccess();return}status('accountLinkStatus','📧 Un e-mail de confirmation Couteau Suisse a été envoyé. Ouvrez-le, confirmez l’adresse e-mail, puis revenez dans Champignons : la liaison se fera automatiquement.','ok');startAccountWatch()}catch(e){var c=e&&e.error||'',m=c==='EMAIL_TROP_RAPIDE'?'Un e-mail a déjà été envoyé récemment. Vérifiez votre boîte mail.':c==='QUOTA_EMAIL_JOURNALIER'?'Envoi d’e-mail momentanément indisponible. Réessayez plus tard.':'Impossible de lier le compte pour le moment.';status('accountLinkStatus','❌ '+m,'bad')}finally{b.disabled=false}}
function fillEntryFields(){var x=identity()||{};if($('entryLastName'))$('entryLastName').value=clean(x.lastName);if($('entryFirstName'))$('entryFirstName').value=clean(x.firstName);if($('entryEmail'))$('entryEmail').value=clean(x.email||localStorage.getItem('carplay_recovery_email')||'')}
function setEntryGate(open){var g=$('firstEntryGate');if(!g)return;g.classList.toggle('hidden',!open);g.setAttribute('aria-hidden',open?'false':'true')}
async function finishEntry(identityData){if(identityData)saveIdentityLocal(identityData);try{localStorage.setItem(ONBOARDING_KEY,'1')}catch(_){}setEntryGate(false);var ok=await checkAccess();refreshCarButton();refreshSavedPositionPanel();if(ok)setUnlockGate(false);else showUnlockGate()}
var entryWatchTimer=null;
function watchEntryVerification(){if(entryWatchTimer)clearInterval(entryWatchTimer);var left=75;entryWatchTimer=setInterval(async function(){left--;var x=identity()||{};try{var r=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:clean(x.email).toLowerCase()}),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(r.ok&&j&&j.verified){clearInterval(entryWatchTimer);entryWatchTimer=null;status('entryStatus','✅ E-mail Champignons confirmé. Connexion enregistrée.','ok');setTimeout(function(){finishEntry(j.identity||x)},700);return}}catch(_){}if(left<=0){clearInterval(entryWatchTimer);entryWatchTimer=null}},4000)}
async function submitFirstEntry(){var last=clean($('entryLastName').value),first=clean($('entryFirstName').value),email=clean($('entryEmail').value).toLowerCase(),b=$('entryContinueBtn');if(last.length<2||first.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status('entryStatus','❌ Nom, prénom et adresse e-mail valide sont obligatoires.','bad');return}saveIdentityLocal({lastName:last,firstName:first,email:email});$('entryNeedCouteau').classList.add('hidden');b.disabled=true;status('entryStatus','Préparation de votre inscription Champignons…');try{var sr=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:email}),cache:'no-store'}),sj=await sr.json().catch(function(){return {}});if(sr.ok&&sj&&sj.verified){await fetch(API_BASE+'/api/app-identity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),platform:'champignons-'+identityPlatform(),firstName:first,lastName:last,email:email,sourceApp:'champignons',appName:'Champignons',notifyEmail:true}),cache:'no-store'}).catch(function(){});status('entryStatus','✅ Compte reconnu. Ouverture de Champignons…','ok');await finishEntry(sj.identity||{lastName:last,firstName:first,email:email});return}var r=await fetch(API_BASE+'/api/app-identity/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),platform:'champignons-'+identityPlatform(),firstName:first,lastName:last,email:email,sourceApp:'champignons',appName:'Champignons',emailBrand:'Champignons',emailSubject:'Champignons — confirmez votre adresse e-mail',redirectUrl:location.origin+location.pathname+'?champignons_confirmed=1',returnUrl:location.origin+location.pathname+'?champignons_confirmed=1',callbackUrl:location.origin+location.pathname+'?champignons_confirmed=1'}),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(r.ok&&j&&j.alreadyVerified){status('entryStatus','✅ Compte reconnu. Ouverture de Champignons…','ok');await finishEntry(j.identity||{lastName:last,firstName:first,email:email});return}if(!r.ok||!j.ok)throw j;$('entryNeedCouteau').classList.remove('hidden');status('entryStatus','📧 Un e-mail de confirmation Champignons a été demandé. Ouvrez-le puis confirmez votre adresse : le lien doit vous ramener directement dans Champignons.','ok');watchEntryVerification()}catch(e){$('entryNeedCouteau').classList.remove('hidden');status('entryStatus','Compte Couteau Suisse non trouvé ou non confirmé. Inscrivez-vous d’abord sur Couteau Suisse, puis revenez ici.','bad')}finally{b.disabled=false}}
async function startEntryGate(){fillEntryFields();if($('openCouteauSuisseBtn'))$('openCouteauSuisseBtn').href=COUTEAU_SUISSE_URL;var done=false;try{done=localStorage.getItem(ONBOARDING_KEY)==='1'}catch(_){}if(done&&identityComplete()){setEntryGate(false);var ok=await checkAccess();if(ok){setUnlockGate(false);return}try{localStorage.removeItem(MAIN_CODE_KEY)}catch(_){}showUnlockGate();return}setEntryGate(true)}

var EDIBLE_MUSHROOM_CATALOG=[
{name:'Cèpe de Bordeaux',scientific:'Boletus edulis',recognize:'Chapeau brun noisette à brun foncé, dessous à tubes blancs puis jaune-olive, pied trapu clair avec fin réseau blanc, chair blanche qui ne bleuit pas.',confusion:'Attention aux bolets amers ou toxiques : la photo seule ne suffit pas.',cook:'Après confirmation certaine : nettoyer sans tremper, couper et cuire complètement à la poêle. Très utilisé en poêlée, sauce ou omelette.'},
{name:'Cèpe bronzé',scientific:'Boletus aereus',recognize:'Chapeau très sombre, brun bronze presque noir, pied épais clair avec réseau fin, pores blancs puis jaunâtres, chair blanche.',confusion:'À distinguer des autres bolets et de certaines espèces amères.',cook:'Après validation : poêlée, sauce ou accompagnement, toujours bien cuit.'},
{name:'Cèpe d’été',scientific:'Boletus reticulatus',recognize:'Chapeau brun clair souvent sec ou craquelé, pied robuste avec réseau blanc bien visible, pores blancs puis jaunes.',confusion:'Plusieurs bolets proches se ressemblent fortement.',cook:'Après validation : cuire complètement à la poêle, en sauce ou omelette.'},
{name:'Cèpe des pins',scientific:'Boletus pinophilus',recognize:'Chapeau brun rouge à acajou, pied robuste clair réticulé, tubes blancs puis jaune-olive, souvent sous conifères.',confusion:'Ne pas se fier uniquement à la couleur du chapeau.',cook:'Après validation : cuisson complète à la poêle ou en sauce.'},
{name:'Bolet bai',scientific:'Imleria badia',recognize:'Chapeau brun châtain, pores jaunes qui bleuissent souvent au toucher, pied brunâtre sans fort réseau.',confusion:'D’autres bolets bleuissants peuvent être toxiques ou indigestes.',cook:'Après validation : bien cuire, idéalement en poêlée ou sauce.'},
{name:'Bolet orangé',scientific:'Leccinum aurantiacum',recognize:'Chapeau orange à roux, pied clair couvert de petites mèches ou ponctuations sombres, pores pâles.',confusion:'Les Leccinum se ressemblent beaucoup ; identification experte recommandée.',cook:'Après validation : cuisson complète et prolongée ; ne jamais consommer cru.'},
{name:'Bolet rude',scientific:'Leccinum scabrum',recognize:'Chapeau brun, pied élancé clair avec nombreuses petites écailles sombres, souvent près des bouleaux.',confusion:'Plusieurs bolets rudes proches nécessitent un contrôle précis.',cook:'Après validation : bien cuire à cœur, en poêlée ou sauce.'},
{name:'Bolet jaune',scientific:'Suillus luteus',recognize:'Chapeau brun très visqueux par temps humide, pores jaunes, anneau sur le pied, associé aux pins.',confusion:'Les Suillus sont nombreux et parfois mal tolérés.',cook:'Après validation : retirer la cuticule visqueuse si souhaité puis cuire complètement.'},
{name:'Bolet granulé',scientific:'Suillus granulatus',recognize:'Chapeau jaune-brun visqueux, pores jaunes pouvant montrer de petites gouttes, pas d’anneau, sous pins.',confusion:'À distinguer des autres Suillus.',cook:'Après validation : retirer la peau visqueuse si souhaité et cuire complètement.'},
{name:'Bolet élégant',scientific:'Suillus grevillei',recognize:'Chapeau jaune à orange très visqueux, pores jaunes, anneau sur le pied, typiquement près des mélèzes.',confusion:'Confusions possibles avec d’autres Suillus.',cook:'Après validation : bien cuire ; souvent utilisé en mélange.'},
{name:'Girolle',scientific:'Cantharellus cibarius',recognize:'Jaune d’œuf, chapeau irrégulier en entonnoir, dessous formé de plis épais et fourchus descendant sur le pied, odeur fruitée.',confusion:'Ne pas confondre avec le clitocybe de l’olivier ou la fausse girolle.',cook:'Après validation : brosser, puis cuisson complète à la poêle, en sauce ou avec des œufs.'},
{name:'Girolle pâle',scientific:'Cantharellus pallens',recognize:'Aspect de girolle mais teinte plus pâle crème-jaune, plis épais sous le chapeau, chair ferme.',confusion:'Confusions possibles avec d’autres chanterelles et espèces orangées.',cook:'Après validation : cuisson complète à la poêle ou en sauce.'},
{name:'Chanterelle en tube',scientific:'Craterellus tubaeformis',recognize:'Petit chapeau brun à gris-brun souvent creusé, pied jaune creux, dessous à plis gris-jaune descendant sur le pied.',confusion:'Des petites espèces brunes peuvent prêter à confusion.',cook:'Après validation : poêlée, sauce ou séchage ; toujours cuire avant consommation.'},
{name:'Chanterelle cendrée',scientific:'Craterellus cinereus',recognize:'Gris à gris-noir, chapeau mince en entonnoir, dessous avec plis gris marqués, pied sombre.',confusion:'À différencier de la trompette-de-la-mort et d’autres champignons sombres.',cook:'Après validation : bien cuire, souvent en poêlée ou sauce.'},
{name:'Trompette-de-la-mort',scientific:'Craterellus cornucopioides',recognize:'Forme de trompette creuse, gris foncé à noire, bord ondulé, dessous lisse à légèrement ridé sans vraies lamelles.',confusion:'Toujours vérifier la forme entière et le dessous du chapeau.',cook:'Après validation : poêlée, sauce ou séchage ; cuisson complète avant consommation.'},
{name:'Pied-de-mouton',scientific:'Hydnum repandum',recognize:'Chapeau crème à beige irrégulier ; dessous couvert de petits aiguillons cassants au lieu de lamelles ; pied clair massif.',confusion:'Les aiguillons sont un repère utile mais ne suffisent pas seuls.',cook:'Après validation : retirer éventuellement les aiguillons des vieux sujets et cuire complètement.'},
{name:'Pied-de-mouton roussissant',scientific:'Hydnum rufescens',recognize:'Plus petit et plus orangé que le pied-de-mouton, dessous à aiguillons clairs, pied plus fin.',confusion:'Très proche d’autres Hydnum.',cook:'Après validation : cuisson complète à la poêle.'},
{name:'Morille commune',scientific:'Morchella esculenta',recognize:'Chapeau alvéolé comme une éponge ou un rayon de miel, pied clair ; champignon entièrement creux quand on le coupe dans la longueur.',confusion:'Attention aux gyromitres et fausses morilles. Validation experte indispensable.',cook:'Ne jamais consommer crue. Après identification certaine : cuisson complète et prolongée avant consommation.'},
{name:'Morille conique',scientific:'Morchella elata',recognize:'Chapeau conique brun à brun-noir fortement alvéolé, pied clair, intérieur entièrement creux.',confusion:'Risque de confusion avec des fausses morilles toxiques.',cook:'Ne jamais consommer crue. Après validation : cuisson complète et prolongée.'},
{name:'Morillon',scientific:'Morchella semilibera',recognize:'Petit chapeau conique alvéolé attaché seulement dans sa partie supérieure au pied ; pied long et creux.',confusion:'Ressemble à d’autres morilles et à des espèces toxiques.',cook:'Ne jamais consommer cru. Après validation : cuisson complète et prolongée.'},
{name:'Coulemelle',scientific:'Macrolepiota procera',recognize:'Très grand chapeau à écailles brunes, mamelon central, anneau épais mobile, pied élancé avec motif brun en peau de serpent, sans volve.',confusion:'Certaines petites lépiotes sont très toxiques : taille et ensemble des caractères sont essentiels.',cook:'Après validation : le chapeau est généralement cuisiné à la poêle ou pané ; cuisson complète obligatoire.'},
{name:'Oronge / Amanite des Césars',scientific:'Amanita caesarea',recognize:'Chapeau orange vif, lamelles jaunes, pied jaune avec anneau, grande volve blanche en sac à la base.',confusion:'Famille contenant des amanites mortelles. Ne jamais se fier à une photo : contrôle expert indispensable.',cook:'Uniquement après confirmation experte formelle : cuire complètement avant consommation.'},
{name:'Lactaire délicieux',scientific:'Lactarius deliciosus',recognize:'Chapeau orange à zones concentriques, lamelles orange, latex orange à la cassure, taches vertes avec l’âge, souvent sous pins.',confusion:'D’autres lactaires peuvent être âcres ou indigestes.',cook:'Après validation : poêlée ou grillé, toujours bien cuit.'},
{name:'Lactaire sanguin',scientific:'Lactarius sanguifluus',recognize:'Chapeau orange à vineux, latex rouge sang à vineux, lamelles orangées, verdissement possible.',confusion:'À distinguer précisément des lactaires voisins.',cook:'Après validation : cuire complètement à la poêle ou au gril.'},
{name:'Lactaire saumon',scientific:'Lactarius salmonicolor',recognize:'Teintes saumonées, latex orange, zones concentriques discrètes, souvent sous sapins.',confusion:'Plusieurs lactaires orangés se ressemblent.',cook:'Après validation : cuisson complète à la poêle.'},
{name:'Lactaire des épicéas',scientific:'Lactarius deterrimus',recognize:'Orange vif puis verdissant, latex orange à rougeâtre, pousse avec les épicéas.',confusion:'Proche d’autres lactaires orangés.',cook:'Après validation : bien cuire ; souvent en poêlée.'},
{name:'Russule charbonnière',scientific:'Russula cyanoxantha',recognize:'Chapeau très variable violet, vert ou gris ; lamelles blanches souples et peu cassantes comparées à beaucoup d’autres russules.',confusion:'Les russules sont nombreuses et difficiles à identifier.',cook:'Après validation : cuisson complète à la poêle.'},
{name:'Russule verdoyante',scientific:'Russula virescens',recognize:'Chapeau vert à vert-gris souvent craquelé en mosaïque, lamelles et pied blancs.',confusion:'Les russules vertes doivent être distinguées avec certitude des amanites verdâtres.',cook:'Après validation experte : cuisson complète à la poêle.'},
{name:'Russule comestible',scientific:'Russula vesca',recognize:'Chapeau rose-brun à brun-rouge, lamelles blanches à crème, pied blanc, chair cassante comme chez les russules.',confusion:'Nombreuses russules proches ; contrôle recommandé.',cook:'Après validation : bien cuire en poêlée.'},
{name:'Russule entière',scientific:'Russula integra',recognize:'Chapeau brun rouge à brun violacé, lamelles devenant crème-jaune, pied blanc robuste.',confusion:'Identification des russules délicate sans examen complet.',cook:'Après validation : cuisson complète.'},
{name:'Agaric champêtre',scientific:'Agaricus campestris',recognize:'Chapeau blanc, lamelles libres roses puis brun chocolat, pied avec petit anneau, pas de volve à la base.',confusion:'Attention aux agarics jaunissants toxiques et aux amanites blanches mortelles.',cook:'Après validation experte : cuire complètement, en poêlée ou omelette.'},
{name:'Agaric des jachères',scientific:'Agaricus arvensis',recognize:'Grand chapeau blanc, lamelles roses puis brunes, anneau développé, odeur souvent anisée.',confusion:'Confusion possible avec agarics toxiques à jaunissement et amanites blanches.',cook:'Après validation : cuisson complète à la poêle.'},
{name:'Agaric des bois',scientific:'Agaricus sylvicola',recognize:'Chapeau blanc à crème, odeur anisée, lamelles roses puis brun chocolat, anneau sur le pied, en forêt.',confusion:'À contrôler soigneusement face aux agarics jaunissants et amanites blanches.',cook:'Après validation : cuire complètement.'},
{name:'Coprin chevelu',scientific:'Coprinus comatus',recognize:'Jeune chapeau blanc cylindrique couvert de mèches, puis bord rosissant et noircissant en se liquéfiant.',confusion:'Ne retenir que des sujets très jeunes et intacts après validation.',cook:'Après validation : cuisiner rapidement après cueillette, bien cuire à la poêle.'},
{name:'Pleurote en huître',scientific:'Pleurotus ostreatus',recognize:'Chapeaux gris à brun en forme d’huître, en touffes sur bois, lamelles blanches descendant sur un pied latéral très court.',confusion:'Vérifier le support, les lamelles et la forme complète.',cook:'Après validation : bien cuire à la poêle, en sauce ou au four.'},
{name:'Pleurote pulmonaire',scientific:'Pleurotus pulmonarius',recognize:'Pleurote plus clair, crème à gris pâle, en bouquets sur bois, lamelles blanches décurrentes.',confusion:'Plusieurs pleurotes se ressemblent.',cook:'Après validation : cuisson complète à la poêle ou au four.'},
{name:'Mousseron de la Saint-Georges',scientific:'Calocybe gambosa',recognize:'Chapeau blanc crème épais, lamelles serrées claires, pied robuste, forte odeur de farine, pousse au printemps.',confusion:'Peut être confondu avec des entolomes toxiques de printemps.',cook:'Après validation : bien cuire à la poêle, en omelette ou sauce.'},
{name:'Marasme des Oréades',scientific:'Marasmius oreades',recognize:'Petit chapeau fauve à beige, lamelles espacées, pied fin mais très coriace, souvent en ronds dans les pelouses.',confusion:'Nombreux petits champignons bruns toxiques : identification experte recommandée.',cook:'Après validation : retirer les pieds coriaces et cuire les chapeaux complètement.'},
{name:'Pied bleu',scientific:'Lepista nuda',recognize:'Chapeau, lamelles et pied violet-lilas chez les jeunes sujets, couleur pâlissant avec l’âge, odeur aromatique.',confusion:'Des cortinaires violets toxiques peuvent ressembler ; contrôle indispensable.',cook:'Ne jamais consommer cru. Après validation : cuisson complète et prolongée.'},
{name:'Pied violet',scientific:'Lepista personata',recognize:'Chapeau beige à brun clair, pied nettement violet-lilas, souvent dans les prairies et pelouses.',confusion:'À distinguer d’autres champignons violets.',cook:'Après validation : cuisson complète et prolongée.'},
{name:'Hygrophore de mars',scientific:'Hygrophorus marzuolus',recognize:'Chapeau gris foncé à noirâtre, lamelles épaisses cireuses blanches puis grises, pousse très tôt en saison.',confusion:'Espèce discrète, identification complète nécessaire.',cook:'Après validation : cuire complètement à la poêle.'},
{name:'Sparassis crépu',scientific:'Sparassis crispa',recognize:'Grande masse crème ressemblant à un chou-fleur, nombreuses lanières ondulées, souvent au pied de conifères.',confusion:'Forme assez caractéristique mais contrôle conseillé.',cook:'Après validation : nettoyer soigneusement entre les plis puis cuire complètement.'},
{name:'Fistuline hépatique / Langue-de-bœuf',scientific:'Fistulina hepatica',recognize:'Console rouge à brun-rouge en forme de langue, chair rougeâtre épaisse, souvent sur chênes ou châtaigniers.',confusion:'Toujours confirmer l’espèce et l’état de fraîcheur.',cook:'Après validation : jeunes sujets en tranches, cuisson complète à la poêle.'},
{name:'Vesse-de-loup géante',scientific:'Calvatia gigantea',recognize:'Très grosse boule blanche sans lamelles ni pied distinct ; jeune, l’intérieur doit être uniformément blanc et compact.',confusion:'Ne jamais consommer si l’intérieur jaunit, brunit ou montre une structure de futur chapeau/pied.',cook:'Après validation : seulement jeune et blanc à cœur ; trancher puis cuire complètement.'},
{name:'Vesse-de-loup perlée',scientific:'Lycoperdon perlatum',recognize:'Petite forme de poire couverte de petites épines/perles ; jeune, intérieur uniformément blanc.',confusion:'Ne jamais utiliser un exemplaire dont l’intérieur n’est pas parfaitement blanc et homogène.',cook:'Après validation : seulement très jeune, tranché et bien cuit.'},
{name:'Poule-des-bois / Maïtaké',scientific:'Grifola frondosa',recognize:'Grande rosette de nombreuses frondes gris-brun imbriquées, souvent à la base de vieux chênes.',confusion:'Vérifier la structure en rosette et l’arbre support.',cook:'Après validation : jeunes parties tendres, bien cuites à la poêle ou au four.'},
{name:'Polypore soufré',scientific:'Laetiporus sulphureus',recognize:'Grandes consoles superposées jaune soufre à orange vif sur bois, chair tendre seulement quand il est jeune.',confusion:'Peut être mal toléré par certaines personnes ; l’arbre support et l’état du champignon comptent.',cook:'Après validation experte : uniquement jeune et tendre, cuisson complète ; commencer par une petite quantité.'},
{name:'Tricholome prétentieux',scientific:'Tricholoma portentosum',recognize:'Chapeau gris sombre à fibrilles radiales, lamelles blanchâtres pouvant jaunir légèrement, pied clair, sous conifères.',confusion:'Le genre Tricholoma contient des espèces toxiques ; validation experte indispensable.',cook:'Après validation : cuisson complète à la poêle.'}
];
function edibleCatalogCard(m,i){
  return '<article class="edibleCard" data-edible-index="'+i+'">'+
    '<div class="ediblePhotoWrap"><img class="ediblePhoto" data-wiki="'+esc(m.scientific)+'" alt="Photo réelle de '+esc(m.name)+'" loading="lazy"><div class="ediblePhotoFallback">🍄<span>PHOTO EN CHARGEMENT</span></div></div>'+
    '<h4>'+esc(m.name)+'</h4><div class="edibleScientific">'+esc(m.scientific)+'</div>'+
    '<div class="edibleInfo recognize"><b>👀 COMMENT LE RECONNAÎTRE</b><span>'+esc(m.recognize)+'</span></div>'+
    '<div class="edibleInfo confusion"><b>⚠️ CONFUSIONS À ÉVITER</b><span>'+esc(m.confusion)+'</span></div>'+
    '<div class="edibleInfo cook"><b>🍳 COMMENT LE CUIRE</b><span>'+esc(m.cook)+'</span></div>'+
  '</article>'
}
async function wikiMushroomPhoto(img){
  if(!img||img.dataset.loaded==='1')return;img.dataset.loaded='1';
  var title=img.dataset.wiki||'';
  for(var lang of ['fr','en']){
    try{
      var url='https://'+lang+'.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&pithumbsize=900&titles='+encodeURIComponent(title);
      var r=await fetch(url,{cache:'force-cache'}),j=await r.json(),pages=j&&j.query&&j.query.pages||{},page=pages[Object.keys(pages)[0]];
      if(page&&page.thumbnail&&page.thumbnail.source){
        img.onload=function(){img.classList.add('loaded')};
        img.src=page.thumbnail.source;
        return
      }
    }catch(_){}
  }
  img.alt='Photo indisponible pour '+title
}
function observeEdiblePhotos(){
  var imgs=Array.from(document.querySelectorAll('#edibleCatalog .ediblePhoto:not([data-observed])'));
  if(!('IntersectionObserver' in window)){imgs.forEach(wikiMushroomPhoto);return}
  var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);wikiMushroomPhoto(e.target)}})},{rootMargin:'500px 0px'});
  imgs.forEach(function(img){img.dataset.observed='1';io.observe(img)})
}
function renderEdibleCatalog(filter){
  var q=normSpecies(filter||''),rows=EDIBLE_MUSHROOM_CATALOG.map(function(m,i){return{m:m,i:i}}).filter(function(x){return !q||normSpecies(x.m.name+' '+x.m.scientific).indexOf(q)>=0});
  var box=$('edibleCatalog');if(box)box.innerHTML=rows.map(function(x){return edibleCatalogCard(x.m,x.i)}).join('');
  status('edibleCount',rows.length+' variété'+(rows.length>1?'s':'')+' affichée'+(rows.length>1?'s':'')+'.','ok');
  observeEdiblePhotos()
}
function closeAllSettingsPanels(){['accountPanel','positionPanel','gpsPanel','membersPanel','ediblePanel'].forEach(function(id){var e=$(id);if(e)e.classList.add('hidden')});var m=document.querySelector('.settingsMenu');if(m)m.classList.remove('hidden')}
function openSettingsPanel(id){closeAllSettingsPanels();var m=document.querySelector('.settingsMenu');if(m)m.classList.add('hidden');var e=$(id);if(e)e.classList.remove('hidden');if(id==='accountPanel')refreshAccountPanel();if(id==='positionPanel')refreshSavedPositionPanel();if(id==='gpsPanel')refreshGpsPref();if(id==='membersPanel')loadMembers();if(id==='ediblePanel')renderEdibleCatalog($('edibleSearch')&&$('edibleSearch').value||'')}
async function refreshAccountPanel(){fillAccountFields();var x=identity()||{},card=$('accountConfirmedCard'),edit=$('accountEditArea');if(!identityComplete(x)){if(card)card.classList.add('hidden');if(edit)edit.classList.remove('hidden');status('accountLinkStatus','Renseignez vos coordonnées Couteau Suisse.');return}var verified=false;try{var r=await fetch(API_BASE+'/api/app-identity/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({deviceId:deviceId(),email:clean(x.email).toLowerCase()}),cache:'no-store'}),j=await r.json().catch(function(){return {}});verified=!!(r.ok&&j&&j.verified);if(verified&&j.identity)x=saveIdentityLocal(j.identity)}catch(_){}if(verified){if(card)card.classList.remove('hidden');if(edit)edit.classList.add('hidden');if($('confirmedAccountName'))$('confirmedAccountName').textContent=(clean(x.firstName)+' '+clean(x.lastName)).trim();if($('confirmedAccountEmail'))$('confirmedAccountEmail').textContent=clean(x.email);status('accountLinkStatus','✅ Compte confirmé et lié.','ok')}else{if(card)card.classList.add('hidden');if(edit)edit.classList.remove('hidden');status('accountLinkStatus','Coordonnées enregistrées. Confirmation Couteau Suisse en attente.')}} 
async function loadMembers(){var list=$('membersList');if(list)list.innerHTML='';status('membersStatus','Chargement des personnes inscrites…');var x=identity()||{};try{var r=await fetch(API_BASE+'/api/mushrooms/members',{method:'POST',headers:authHeaders(),body:JSON.stringify(accessPayload({action:'list'})),cache:'no-store'}),j=await r.json().catch(function(){return {}});if(r.ok&&j&&j.ok&&Array.isArray(j.members)){var rows=j.members;if(list)list.innerHTML=rows.length?rows.map(function(m){var name=(clean(m.firstName)+' '+clean(m.lastName)).trim()||clean(m.name)||'Membre Champignons';return '<div class="memberRow"><div class="memberAvatar">🍄</div><div><b>'+esc(name)+'</b><small>Inscrit à Champignons</small></div></div>'}).join(''):'<div class="empty">Aucune autre personne inscrite.</div>';status('membersStatus',rows.length+' personne'+(rows.length>1?'s':'')+' inscrite'+(rows.length>1?'s':'')+'.','ok');return}}catch(_){}var selfName=(clean(x.firstName)+' '+clean(x.lastName)).trim();if(list&&selfName)list.innerHTML='<div class="memberRow"><div class="memberAvatar">🍄</div><div><b>'+esc(selfName)+'</b><small>Compte Champignons confirmé sur ce téléphone</small></div></div>';status('membersStatus','La liste complète des inscrits sera affichée dès que le serveur Champignons la fournit. Votre compte confirmé est affiché ci-dessous.',selfName?'ok':'bad')}
function openMushSettings(){var x=$('mushSettings');x.classList.remove('hidden');x.setAttribute('aria-hidden','false');closeAllSettingsPanels();refreshGpsPref();refreshSavedPositionPanel()}
function closeMushSettings(){var x=$('mushSettings');x.classList.add('hidden');x.setAttribute('aria-hidden','true')}
if($('mushSettingsBtn'))$('mushSettingsBtn').onclick=openMushSettings;
if($('closeMushSettings'))$('closeMushSettings').onclick=closeMushSettings;
if($('openAccountPanelBtn'))$('openAccountPanelBtn').onclick=function(){openSettingsPanel('accountPanel')};
if($('openPositionPanelBtn'))$('openPositionPanelBtn').onclick=function(){openSettingsPanel('positionPanel')};
if($('openGpsPanelBtn'))$('openGpsPanelBtn').onclick=function(){openSettingsPanel('gpsPanel')};
if($('openMembersPanelBtn'))$('openMembersPanelBtn').onclick=function(){openSettingsPanel('membersPanel')};
if($('openEdiblePanelBtn'))$('openEdiblePanelBtn').onclick=function(){openSettingsPanel('ediblePanel')};
if($('refreshMembersBtn'))$('refreshMembersBtn').onclick=loadMembers;
if($('edibleSearch'))$('edibleSearch').addEventListener('input',function(){renderEdibleCatalog(this.value)});
Array.from(document.querySelectorAll('[data-close-panel]')).forEach(function(b){b.onclick=closeAllSettingsPanels});
if($('saveCouteauAccountBtn'))$('saveCouteauAccountBtn').onclick=saveCouteauAccount;
if($('entryContinueBtn'))$('entryContinueBtn').onclick=submitFirstEntry;
if($('unlockSubmitBtn'))$('unlockSubmitBtn').onclick=submitUnlockCode;
if($('requestCodeEmailBtn'))$('requestCodeEmailBtn').onclick=requestCodeByEmail;
if($('unlockCodeInput')){$('unlockCodeInput').addEventListener('input',function(e){e.target.value=formatActivationCode(e.target.value)});$('unlockCodeInput').addEventListener('keydown',function(e){if(e.key==='Enter')submitUnlockCode()})}
if($('carBtn'))$('carBtn').onclick=carAction;
if($('carStatus'))$('carStatus').onclick=eraseCarPosition;
if($('saveMyPositionBtn'))$('saveMyPositionBtn').onclick=saveOrUpdateMyPosition;
if($('installAppBtn'))$('installAppBtn').onclick=installStandalone;
if($('installFromSettingsBtn'))$('installFromSettingsBtn').onclick=installStandalone;
if($('closeInstallHelp'))$('closeInstallHelp').onclick=function(){$('installHelp').classList.add('hidden')};
Array.from(document.querySelectorAll('[data-gps]')).forEach(function(b){b.onclick=function(){localStorage.setItem('gps_pref',b.dataset.gps);refreshGpsPref()}});
function refreshInstallButton(){var b=$('installAppBtn');if(!b)return;b.textContent=isStandaloneApp()?'INSTALLÉE':'INSTALLER'}
window.addEventListener('appinstalled',refreshInstallButton);
window.addEventListener('pagehide',stopCamera);window.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&identityComplete())refreshAccountLinkStatus(true)});fillAccountFields();refreshInstallButton();refreshCarButton();refreshSavedPositionPanel();upgradeSavedWoodPhotos();show('homeView');importSharedWoodFromUrl();try{var qp=new URLSearchParams(location.search);if(qp.get('champignons_confirmed')==='1'){localStorage.setItem(ONBOARDING_KEY,'1');history.replaceState(null,'',location.pathname)}}catch(_){}startEntryGate();
})();