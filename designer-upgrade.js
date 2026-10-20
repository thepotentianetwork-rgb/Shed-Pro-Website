/* designer-upgrade.js: conversion and UX layer for designer.html.
   Loaded after the main script, and only touches the designer through the
   small hooks it calls (DU.onStep, DU.onStarter, DU.renderReview,
   DU.renderSuccess, DU.leadContext, DU.afterQuoteForm, DU.shareDesign).
   If this file fails to load, the designer still works exactly as before. */
(function(){
'use strict';

/* ── ANALYTICS IDS ─────────────────────────────────────────────────────────
   Vercel Web Analytics is always on (see <head>). Fill these in to send the
   same events to GA4 and Meta. The rest of the site already uses GA4
   G-GR8BG7DXZE; paste it here once confirmed. Leave '' to disable. */
var GA4_ID = '';          // e.g. 'G-XXXXXXXXXX'
var META_PIXEL_ID = '';   // e.g. '1234567890'

var AUTOSAVE_KEY = 'sp_designer_autosave_v1';
var AUTOSAVE_MAX_AGE = 30*24*3600*1000;
var DU = window.DU = window.DU || {};
var T0 = Date.now();
var visited = {}, furthest = 0, lastStep = -1, resumed = false, sharedCount = 0;
var interacted = false, dirty = false, lastSavedHash = null;
var shareCache = {hash:null, link:null};

function $(id){ return document.getElementById(id); }
function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function ss(k,v){ try{ if(v===undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k,v); }catch(e){ return null; } }

/* ── analytics ── */
(function initAnalytics(){
  if(GA4_ID){
    var g=document.createElement('script'); g.async=true;
    g.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(GA4_ID);
    document.head.appendChild(g);
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', GA4_ID);
  }
  if(META_PIXEL_ID && !window.fbq){
    /* Standard Meta Pixel bootstrap. */
    var n=window.fbq=function(){ n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments); };
    if(!window._fbq) window._fbq=n; n.push=n; n.loaded=true; n.version='2.0'; n.queue=[];
    var f=document.createElement('script'); f.async=true; f.src='https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(f);
    window.fbq('init', META_PIXEL_ID); window.fbq('track','PageView');
  }
})();
DU.track = function(name, data){
  data = data || {};
  try{ if(window.va) window.va('event', {name:name, data:data}); }catch(e){}
  try{ if(GA4_ID && window.gtag) window.gtag('event', name, data); }catch(e){}
  try{
    if(META_PIXEL_ID && window.fbq){
      if(name==='quote_submitted') window.fbq('track','Lead');
      else if(name==='consult_submitted') window.fbq('track','Contact');
      else window.fbq('trackCustom', name, data);
    }
  }catch(e){}
};

/* ── staff mode: the padlock is for staff only ── */
function isStaff(){
  if(/[#&]staff\b/.test(location.hash||'')) ss('shed_staff','1');
  return ss('shed_staff')==='1' || !!ss('shed_admin_token') || ss('shed_price_unlocked')==='1';
}
function applyStaff(){ document.body.classList.toggle('du-staff', isStaff()); }

/* ── names ── */
var STYLE_NAMES = {gable:'Gable / A-Frame', barn:'Barn', leanto:'Modern Single Slope', hip:'Poolhouse / Hip', '3peak':'3-Peak', '4peak':'4-Peak'};
DU.styleName = function(){ return STYLE_NAMES[window.STYLE] || window.STYLE || ''; };
var FOUNDATION_NAMES = {pad:'Concrete pad, poured by us', blocks:'Leveled on cinder blocks', gravel:'Gravel pad + leveled on blocks', existing:'Existing foundation'};
var ELEC_NAMES = {none:'None', basic:'Basic (power-ready)', core:'Core package (power-ready)', essential:'Essential package (power-ready)'};
var SIDING_NAMES = {vertical:'Vertical siding', horizontal:'Horizontal lap siding', 'board-batten':'Board & batten', pine:'Pine'};
function doorName(d){
  var nm=null;
  try{
    (window.DOOR_SIZES||[]).forEach(function(cat){
      (cat.styles||[]).forEach(function(st){
        if(nm || st[0]!==d.style) return;
        var w=st[3]||cat.w;
        if(w!==d.w && cat.kind!=='residential') return;
        if(cat.kind==='single'||cat.kind==='double') nm=cat.name+' '+st[1];
        else if(cat.kind==='cedar') nm=cat.name.replace('Cedar ', st[1].replace(' Cedar','')+' Cedar ');
        else if(cat.kind==='residential') nm=cat.name+' '+st[1];
        else nm=st[1];
      });
    });
  }catch(e){}
  return nm || (d.style ? d.style.charAt(0).toUpperCase()+d.style.slice(1) : 'Door');
}
function countBy(list, f){
  var m={}, order=[];
  list.forEach(function(x){ var k=f(x); if(!m[k]){ m[k]=0; order.push(k); } m[k]++; });
  return order.map(function(k){ return (m[k]>1?m[k]+'× ':'')+k; });
}
function addonList(){
  var a=window.ADDONS||{}, out=[];
  if(a.shutters) out.push((a.shutterColor?cap(a.shutterColor)+' ':'')+'shutters');
  if(a.flowerboxes) out.push((a.fbColor?cap(a.fbColor)+' ':'')+'flower boxes');
  if(a.cupola && a.cupola!=='none') out.push(cap(a.cupola)+' cupola');
  if(a.ridgeVent) out.push('Ridge vent');
  var spr=window.SPRINKLERS||[];
  if(spr.length) out.push('Sprinkler relocation ('+spr.length+' head'+(spr.length===1?'':'s')+')');
  Object.keys(a).forEach(function(k){
    if(['shutters','flowerboxes','cupola','ridgeVent','shutterColor','fbColor'].indexOf(k)>=0) return;
    if(a[k]===true) out.push(cap(k.replace(/([A-Z])/g,' $1').toLowerCase()));
  });
  return out;
}
function cap(s){ s=String(s||''); return s.charAt(0).toUpperCase()+s.slice(1); }

/* ── a snapshot of the shed from the opening angle ── */
DU.snapshot = function(w){
  try{
    var R=window.renderer, sc=window.scene, cam=window.camera; if(!R||!sc||!cam) return null;
    var sp=window.phi, st=window.theta, sr=window.radius;
    window.phi=1.2; window.theta=0.62;
    window.radius=(typeof window.fitRadius==='function') ? window.fitRadius()*1.08 : sr;
    window.updateCamera(); R.render(sc,cam);
    var url=R.domElement.toDataURL('image/jpeg', 0.82);
    window.phi=sp; window.theta=st; window.radius=sr; window.updateCamera(); R.render(sc,cam);
    return url;
  }catch(e){ return null; }
};

/* ── spec-sheet review ── */
DU.specRows = function(){
  var S=window, rows=[];
  var porch = (S.PORCH_LOC && S.PORCH_LOC!=='none' && S.SIDE_PORCH>0);
  rows.push(['Style & size', S.W+'×'+S.L+' ft '+DU.styleName()+' · '+S.H+' ft walls'+(porch?' · '+S.SIDE_PORCH+' ft '+S.PORCH_LOC+' porch':''), 'Pick your size']);
  rows.push(['Foundation', FOUNDATION_NAMES[S.FOUNDATION]||S.FOUNDATION, 'Foundation']);
  /* Siding, trim and door colour each get their own row, so a brand paint pick
     (paint-codes.js) reads in full: "Siding · Sherwin-Williams SW 7006 Extra White". */
  rows.push(['Siding', (SIDING_NAMES[S.SIDING]||S.SIDING)+(S.SIDING!=='pine' && S.sn ? ' · '+S.sn : ''), 'Siding & color']);
  rows.push(['Trim', S.TRIM_FINISH==='cedar' ? 'Natural cedar' : (S.tn||''), 'Siding & color']);
  var pcNames=null;
  try{ if(S.PC && S.PC.decorateConfig) pcNames=S.PC.decorateConfig({}).colorNames; }catch(e){}
  if(pcNames && pcNames.door) rows.push(['Door color', pcNames.door, 'Siding & color']);
  var roof=(S.ROOFTYPE==='metal'?'Metal':'Shingle')+' · '+(S.rn||'');
  if(S.STYLE!=='barn' && S.STYLE!=='leanto' && S.PITCH) roof+=' · '+S.PITCH+'/12 pitch';
  if(S.OVH) roof+=' · '+S.OVH+'" overhang';
  if(S.STYLE==='leanto' && S.LEANTO_FRONT_OVH!=null && S.LEANTO_FRONT_OVH!=='match') roof+=' · '+S.LEANTO_FRONT_OVH+'" front eave';
  rows.push(['Roof', roof, 'Roof']);
  rows.push(['Doors', (S.doorsData||[]).length ? countBy(S.doorsData, doorName).join(', ') : 'None', 'Doors']);
  rows.push(['Windows', (S.windowsData||[]).length ? countBy(S.windowsData, function(w){ return w.type||(w.w+'×'+w.h); }).join(', ') : 'None', 'Windows & Vents']);
  var inside=[];
  if(S.INT_FINISH && S.INT_FINISH!=='none') inside.push(cap(S.INT_FINISH)+' interior'+(S.INT_FINISH==='painted' && S.ipn ? ' ('+S.ipn+')' : ''));
  if(S.LOFT && S.LOFT!=='none') inside.push('Loft');
  if((S.shelvesData||[]).length) inside.push(S.shelvesData.length+' shelf'+(S.shelvesData.length>1?'ves':''));
  rows.push(['Interior', inside.length?inside.join(' · '):'Unfinished', 'Interior']);
  var el=ELEC_NAMES[S.ELEC]||S.ELEC;
  if((S.porchLightsData||[]).length && S.ELEC!=='none') el+=' · '+S.porchLightsData.length+' porch light'+(S.porchLightsData.length>1?'s':'');
  rows.push(['Electrical', el, 'Electrical']);
  var ad=addonList();
  rows.push(['Add-ons', ad.length?ad.join(', '):'None', 'Add-Ons']);
  return rows;
};
/* The paint disclaimer, shown under the spec sheet only when a brand colour is
   actually on the shed (paint-codes.js owns the wording). */
DU.paintNote = function(){
  try{
    var P=window.PC; if(!P || !P.livePick) return '';
    return (P.livePick('s')||P.livePick('t')||P.livePick('d')||P.livePick('i')) ? P.NOTE : '';
  }catch(e){ return ''; }
};
DU.renderReview = function(host){
  var img=DU.snapshot();
  var rows=DU.specRows();
  host.innerHTML =
    (img?'<img class="du-rv-img" src="'+img+'" alt="Your shed from the front">':'')+
    '<dl class="du-rv">'+rows.map(function(r){
      return '<div class="du-rv-row"><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd>'+
        '<button type="button" class="du-rv-edit" onclick="wizGoTo(\''+r[2].replace(/'/g,"\\'")+'\')" aria-label="Edit '+esc(r[0])+'">Edit</button></div>';
    }).join('')+'</dl>'+
    (DU.paintNote() ? '<div class="du-rv-note">'+esc(DU.paintNote())+'</div>' : '')+
    '<div class="du-rv-actions"><button type="button" class="du-btn-ghost" onclick="DU.shareDesign(\'review\')">Share or text this design</button></div>';
  return true;
};

/* ── step tracking ── */
DU.onStep = function(i){
  var steps=window.WIZ_STEPS||[];
  visited[i]=1; if(i>furthest) furthest=i;
  var b=document.body;
  b.classList.toggle('du-first', i===0);
  b.classList.toggle('du-last', i===steps.length-1);
  if(i!==lastStep){
    lastStep=i;
    if(steps[i]) DU.track('step_viewed', {step:steps[i].title});
  }
};
DU.onStarter = function(k){
  markInteract();
  DU.track('starter_chosen', {starter:k});
};

/* ── lead context: goes inside page{} on quote + consult ── */
function device(){
  var w=window.innerWidth||0;
  var coarse=false; try{ coarse=matchMedia('(pointer:coarse)').matches; }catch(e){}
  return (w<=600||(/Mobi|Android/i.test(navigator.userAgent)&&w<900)) ? 'mobile' : (coarse||w<=1024 ? 'tablet' : 'desktop');
}
DU.leadContext = function(){
  var steps=window.WIZ_STEPS||[];
  var src=null; try{ src=window.SPLeadSource ? window.SPLeadSource.get() : null; }catch(e){}
  return {
    source: src,
    device: device(),
    vw: window.innerWidth||null,
    secs: Math.round((Date.now()-T0)/1000),
    steps: Object.keys(visited).length,
    furthest: steps[furthest] ? steps[furthest].title : null,
    starter: window.SHED_USE || null,
    resumed: resumed,
    shared: sharedCount
  };
};

/* ── heard-about prefill from the ad click ── */
DU.afterQuoteForm = function(){
  var sel=$('qHeard'); if(!sel || sel.value) return;
  var src=null; try{ src=window.SPLeadSource ? window.SPLeadSource.get() : null; }catch(e){}
  var t=(src && (src.last||src.first)) || null; if(!t) return;
  var s=((t.utm_source||'')+' '+(t.ref||'')).toLowerCase();
  if(t.fbclid || /facebook|instagram|\bfb\b|\big\b|meta/.test(s)) sel.value='facebook';
  else if(t.gclid || /google/.test(s)) sel.value='google';
};

/* ── share ── */
function getShareLink(){
  var cfg=window.getDesignConfig(), h=JSON.stringify(cfg);
  if(shareCache.hash===h && shareCache.link) return Promise.resolve(shareCache.link);
  return window.saveDesignAndGetLink(null).then(function(link){ shareCache={hash:h, link:link}; return link; });
}
function closeSheet(){ var o=$('duSheet'); if(o) o.remove(); }
DU.closeSheet = closeSheet;
function openSheet(html, labelledBy){
  closeSheet();
  var o=document.createElement('div');
  o.id='duSheet'; o.className='du-overlay';
  o.innerHTML='<div class="du-sheet" role="dialog" aria-modal="true" aria-labelledby="'+labelledBy+'">'+html+'</div>';
  o.addEventListener('click', function(e){ if(e.target===o) closeSheet(); });
  document.body.appendChild(o);
  var f=o.querySelector('button, a, input'); if(f) try{ f.focus(); }catch(e){}
  return o;
}
DU.shareDesign = function(where, knownLink){
  markInteract();
  var o=openSheet('<div class="du-sheet-h"><h2 id="duShareT">Share your design</h2>'+
    '<button type="button" class="du-x" onclick="DU.closeSheet()" aria-label="Close">&times;</button></div>'+
    '<p class="du-sheet-p">Send it to your spouse, your HOA or yourself. The link opens this exact shed.</p>'+
    '<div id="duShareBody" class="du-share-body"><div class="du-sheet-p">Creating your link&hellip;</div></div>', 'duShareT');
  var p = knownLink ? Promise.resolve(knownLink) : getShareLink();
  p.then(function(link){
    var b=o.querySelector('#duShareBody'); if(!b) return;
    var msg='Check out the shed I designed with ShedPro: '+link;
    b.innerHTML=
      '<input class="inp du-share-link" id="duShareLink" readonly value="'+esc(link)+'" aria-label="Design link" onfocus="this.select()">'+
      '<div class="du-share-btns">'+
        '<a class="du-btn" id="duShareSms" href="sms:?&body='+encodeURIComponent(msg)+'">Text it</a>'+
        (navigator.share?'<button type="button" class="du-btn" id="duShareNative">More options</button>':'')+
        '<button type="button" class="du-btn" id="duShareCopy">Copy link</button>'+
      '</div>';
    var done=function(method){ sharedCount++; DU.track('design_shared', {method:method, where:where||''}); };
    b.querySelector('#duShareSms').addEventListener('click', function(){ done('sms'); });
    var nb=b.querySelector('#duShareNative');
    if(nb) nb.addEventListener('click', function(){
      navigator.share({title:'My ShedPro design', text:'Check out the shed I designed with ShedPro', url:link})
        .then(function(){ done('native'); }).catch(function(){});
    });
    b.querySelector('#duShareCopy').addEventListener('click', function(ev){
      var btn=ev.currentTarget;
      var ok=function(){ btn.textContent='Copied!'; done('copy'); setTimeout(function(){ btn.textContent='Copy link'; },1800); };
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function(){ legacyCopy(link); ok(); });
      else { legacyCopy(link); ok(); }
    });
  });
};
function legacyCopy(t){
  var i=$('duShareLink'); if(i){ i.focus(); i.select(); try{ document.execCommand('copy'); }catch(e){} }
}

/* ── post-submit ── */
DU.renderSuccess = function(o){
  var img=DU.snapshot();
  var rows=DU.specRows().slice(0,5);
  var first=esc(String(o.name||'').split(' ')[0]);
  var html='<div class="du-success">'+
    '<div class="du-ok" aria-hidden="true">&#10003;</div>'+
    '<h2 class="du-success-h">Thank you for your submission, '+first+'.</h2>'+
    '<p class="du-sheet-p">A representative will reach out shortly to discuss your estimate with you.</p>'+
    '<p class="du-sheet-p du-fast">If you would like help with this sooner, contact us.</p>'+
    '<p class="du-fast-row">'+
      '<span class="du-fast-num"><a class="du-fast-a" href="tel:+14352770764" aria-label="Call 435-277-0764"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg><span>435-277-0764</span></a>'+
      '<a class="du-fast-sms" href="sms:+14352770764" aria-label="Text 435-277-0764" title="Text us"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></a></span>'+
      '<a class="du-fast-a" href="mailto:info@shedpro-utah.com"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg><span>info@shedpro-utah.com</span></a>'+
    '</p>'+
    (img?'<img class="du-rv-img" src="'+img+'" alt="The shed you sent us">':'')+
    '<dl class="du-rv du-rv-compact">'+rows.map(function(r){ return '<div class="du-rv-row"><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>'; }).join('')+'</dl>'+
    (aiRenderOn()?'<div class="du-ai" id="duAi" aria-live="polite"><div class="du-ai-h">Artist\'s rendering</div>'+
      '<div class="du-ai-body" id="duAiBody"><div class="du-ai-spin" aria-hidden="true"></div>'+
      '<p>Your artist\'s rendering is being created. This takes about 1–2 minutes, and you can keep this page open.</p></div></div>':'')+
    '<div class="du-next"><div class="du-next-h">What happens next</div><ol>'+
      '<li><b>A ShedPro rep calls you within 24 hours</b> to go over your design and finalize your quote.</li>'+
      '<li><b>Reserve your spot</b> on our build schedule.</li>'+
    '</ol></div>'+
    '<div class="du-success-btns">'+
      '<button type="button" class="cta" id="duTextDesign">Text this design to someone</button>'+
      '<button type="button" class="du-btn-ghost" onclick="closeSubPage()">Keep designing</button>'+
      '<a class="du-btn-ghost" href="tel:4352770764">Questions? Call 435-277-0764</a>'+
    '</div></div>';
  window.openSubPage('Request sent', html);
  try{ localStorage.removeItem(AUTOSAVE_KEY); }catch(e){}
  var t=$('duTextDesign'); if(t) t.addEventListener('click', function(){ DU.shareDesign('success', o.link); });
  if(aiRenderOn()) DU.startAiRender(o);
};

/* ── artist's rendering (TEST — off unless ?airender=1 or window.SP_AI_RENDER,
   AND the server has RENDER_ENABLED=1; any failure hides the card) ── */
function aiRenderOn(){
  return window.SP_AI_RENDER===true || /[?&]airender=1(&|$)/.test(location.search);
}
DU.startAiRender = function(o){
  var card=$('duAi'), body=$('duAiBody');
  function hide(){ if(card) card.remove(); }
  if(!card || typeof window.getDesignConfig!=='function' || !window.fetch) return hide();
  var img=null;
  try{ img=(window.DR && DR.captureForAI) ? DR.captureForAI() : null; }catch(e){}
  var tries=0, started=Date.now();
  fetch('/api/render',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({image:img, config:window.getDesignConfig(), code:o && o.link || null})})
  .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
  .then(function(j){ if(!j || !j.id) throw new Error('no id'); poll(j.id); })
  .catch(hide);
  function poll(id){
    setTimeout(function(){
      if(!document.body.contains(card)) return;          // sheet closed
      if(++tries>60 || Date.now()-started>5*60000) return hide();
      fetch('/api/render?id='+encodeURIComponent(id),{cache:'no-store'})
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(j){
        if(j.status==='done' && j.url) return show(j);
        if(j.status==='pending') return poll(id);
        hide();
      }).catch(hide);
    }, 5000);
  }
  function show(j){
    body.innerHTML='<figure class="du-ai-fig"><img src="'+esc(j.url)+'" alt="Artist\'s rendering of your shed">'+
      '<figcaption>Artist\'s rendering. Your final build follows your approved design.'+
      (j.mock?' <span class="du-ai-mock">(Sample image, test mode)</span>':'')+'</figcaption></figure>';
    try{ if(window.DU && DU.track) DU.track('ai_render_shown',{mock:!!j.mock}); }catch(e){}
  }
};

/* ── autosave + resume ── */
function markInteract(){ interacted=true; dirty=true; }
function autosave(){
  if(!interacted || !dirty || typeof window.getDesignConfig!=='function') return;
  dirty=false;
  try{
    var cfg=window.getDesignConfig(), h=JSON.stringify(cfg)+'|'+(window.wizStep||0);
    if(h===lastSavedHash) return; lastSavedHash=h;
    // Never offer to "continue" the untouched default shed.
    if(window.STOCK_CONFIG){
      var a=Object.assign({},cfg,{use:null}), b=Object.assign({},window.STOCK_CONFIG,{use:null});
      if(JSON.stringify(a)===JSON.stringify(b)) return;
    }
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({t:Date.now(), step:window.wizStep||0, cfg:cfg}));
  }catch(e){}
}
function readSaved(){
  try{
    var s=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)||'null');
    if(!s || !s.cfg || !s.t || Date.now()-s.t>AUTOSAVE_MAX_AGE) return null;
    return s;
  }catch(e){ return null; }
}
function ago(t){
  var m=Math.round((Date.now()-t)/60000);
  if(m<2) return 'just now'; if(m<60) return m+' minutes ago';
  var h=Math.round(m/60); if(h<24) return h+' hour'+(h>1?'s':'')+' ago';
  var d=Math.round(h/24); return d+' day'+(d>1?'s':'')+' ago';
}
function offerResume(){
  if(/[?&#]d=/.test(location.href)) return;          // a shared design wins
  var s=readSaved(); if(!s) return;
  var c=s.cfg, sn={gable:'Gable / A-Frame',barn:'Barn',leanto:'Modern Single Slope',hip:'Poolhouse / Hip','3peak':'3-Peak','4peak':'4-Peak'}[c.style]||c.style;
  window._consultRetired=true; if(typeof window.hideConsultNudge==='function') window.hideConsultNudge();
  var card=document.createElement('div');
  card.id='duResume'; card.className='du-resume'; card.setAttribute('role','dialog'); card.setAttribute('aria-labelledby','duResumeT');
  card.innerHTML='<div class="du-resume-t" id="duResumeT">Continue your design?</div>'+
    '<div class="du-resume-s">'+esc(c.w+'×'+c.l+' '+sn)+' · saved '+esc(ago(s.t))+'</div>'+
    '<div class="du-resume-b"><button type="button" class="du-btn" id="duResumeYes">Continue</button>'+
    '<button type="button" class="du-btn-ghost" id="duResumeNo">Start fresh</button></div>';
  (document.querySelector('.vp')||document.body).appendChild(card);
  $('duResumeYes').addEventListener('click', function(){
    card.remove(); resumed=true;
    window.applyDesignConfig(c);
    if(c.use!=null) window.SHED_USE=c.use;
    try{
      if(window.starterColorName){
        // A brand paint pick (c.paint) already restored its own label.
        var cp=c.paint||{};
        if(!cp.siding) window.sn=window.starterColorName(c.sidingColor, window.WALL_COLORS, window.sn);
        if(!cp.trim) window.tn=window.starterColorName(c.trimColor, window.WALL_COLORS, window.tn);
        window.rn=window.starterColorName(c.roofColor, c.roofType==='metal'?window.METAL_COLORS:window.SHINGLE_COLORS, window.rn);
      }
    }catch(e){}
    if(typeof window.renderUseGrid==='function') window.renderUseGrid();
    if(typeof window.renderStyleTiles==='function') window.renderStyleTiles();
    if(typeof window.updateSum==='function') window.updateSum();
    var st=Math.max(0, Math.min((window.WIZ_STEPS||[]).length-1, +s.step||0));
    window.wizStep=st; window.wizRender();
    interacted=true; lastSavedHash=JSON.stringify(window.getDesignConfig())+'|'+st;
    DU.track('design_resumed', {step:st});
  });
  $('duResumeNo').addEventListener('click', function(){
    card.remove();
    try{ localStorage.removeItem(AUTOSAVE_KEY); }catch(e){}
  });
}

/* ── accessibility: make the clickable divs behave like buttons ── */
var A11Y_SEL='.tile, .pitch-btn, .scheme-tile, .size-tile, .cs, .shingle-btn';
var NATIVE=/^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|OPTION|CANVAS|BODY|HTML|SUMMARY)$/;
function enhance(root){
  var list=(root||document).querySelectorAll(A11Y_SEL+', [onclick]');
  for(var i=0;i<list.length;i++){
    var el=list[i];
    if(NATIVE.test(el.tagName) || el.closest('#duSheet')) continue;
    if(el.id==='subPage' || el.classList.contains('du-overlay')) continue;
    if(!el.hasAttribute('role')) el.setAttribute('role','button');
    if(el.getAttribute('role')!=='button') continue;
    if(!el.hasAttribute('tabindex')) el.setAttribute('tabindex','0');
    if(el.matches(A11Y_SEL)){
      var on=el.classList.contains('on')||el.classList.contains('sel')||el.classList.contains('active');
      if(el.getAttribute('aria-pressed')!==String(on)) el.setAttribute('aria-pressed', String(on));
    }
  }
}
var _enhQueued=false;
function queueEnhance(){
  if(_enhQueued) return; _enhQueued=true;
  (window.requestAnimationFrame||setTimeout)(function(){ _enhQueued=false; enhance(document); });
}
document.addEventListener('keydown', function(e){
  if(e.key==='Escape' && $('duSheet')){ closeSheet(); return; }
  if(e.key!=='Enter' && e.key!==' ') return;
  var t=e.target; if(!t || NATIVE.test(t.tagName)) return;
  if(t.getAttribute && t.getAttribute('role')==='button'){ e.preventDefault(); t.click(); }
});

/* ── touch-aware hint ── */
function setHint(){
  var h=$('vpHint'); if(!h) return;
  var coarse=false; try{ coarse=matchMedia('(pointer:coarse)').matches; }catch(e){}
  if(coarse) h.innerHTML='Drag to rotate &nbsp;&middot;&nbsp; Pinch to zoom';
}

/* ── boot ── */
function boot(){
  applyStaff();
  setHint();
  enhance(document);
  try{
    new MutationObserver(queueEnhance).observe(document.body, {subtree:true, childList:true, attributes:true, attributeFilter:['class']});
  }catch(e){}
  ['pointerdown','keydown','change','input','wheel'].forEach(function(ev){
    document.addEventListener(ev, function(e){ if(e.target && e.target.closest && e.target.closest('#duResume, #duSheet')) return; markInteract(); }, {passive:true, capture:true});
  });
  setInterval(autosave, 2500);
  window.addEventListener('pagehide', function(){ dirty=true; autosave(); });
  if(typeof window.wizStep==='number') DU.onStep(window.wizStep);
  window.addEventListener('hashchange', applyStaff);
}
function late(){
  setTimeout(offerResume, 700);   // after the designer's own boot (load + 400ms) has loaded any shared design
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
if(document.readyState==='complete') late(); else window.addEventListener('load', late);
})();
