/* designer-trust.js — credibility + promo inside the 3D designer.
   1. A small floating review bubble over the 3D view (bottom-left on desktop,
      a compact pill above the "Drag to rotate" hint on phones). It rotates
      through the REAL reviews shown on the home page (#reviews in index.html),
      copied verbatim with the names exactly as the home page shows them.
      tests/ui/trust.test.mjs fails if any of them drifts from index.html, so
      if you edit the home page reviews, paste the same change here.
      Tap to expand into a card with 3 full reviews; x dismisses it for the
      session. It steps aside whenever another overlay needs that corner (the
      resume card, the consult nudge, the wall picker, edit mode, a dialog).
   2. The "$500 off a concrete pad" promo from the home page (same wording,
      same end date, same auto-hide on Nov 4, 2026). Display only: it does not
      touch the price, the same as on the home page.
   If this file fails to load, the designer works exactly as before. */
(function(){
'use strict';
var DT = window.DT = window.DT || {};

/* ── 1. REVIEWS (verbatim from index.html #reviews) ── */
var REVIEWS = [
  {"src": "google", "name": "Steven E.", "label": "Google review", "stars": 5, "text": "The people at ShedproUT did a fantastic job. They communicated well, they did what they said they were going to do and at a fair price. The workmanship Is great. I look forward to enjoying the shed for years."},
  {"src": "facebook", "name": "Ashley M.", "label": "Facebook recommendation", "stars": null, "text": "Christian with Shed Pro is incredible! He came over to our home to give us a quote, gave us a few options and worked with what we had. Incredibly professional and easy going guy. Shed was put up in one day and is perfection! Communication was great, did exactly what we asked him to, I will only recommend him from now on. He is very competitive in his prices, and his work is top notch. Stop looking and go with Shed Pro!"},
  {"src": "google", "name": "Steve P.", "label": "Google review", "stars": 5, "text": "The team from Shedpro did an amazing job of building our shed. We are delighted to have our new shed! The workmanship is excellent and the shed looks so nice! They communicated well and asked great questions to build it to the specifications that we wanted. Thank you! Thank you!"},
  {"src": "facebook", "name": "Klay H.", "label": "Facebook recommendation", "stars": null, "text": "Christian and his crew came over and completed the project in one day. They were super professional, they did an incredible job, and the customer service was awesome! Before they finished up, they asked me to come take a look and see if everything was done how I had wanted. The entire project was done with a lot of attention to detail, and everything that they said they would do, was completed professionally! I would totally recommend these guys!"},
  {"src": "google", "name": "Abi S.", "label": "Google review", "stars": 5, "text": "Christian is very professional, super reliable and extremely knowledgeable. He came out and helped design a beautiful shed that fit the space, the work was done without cutting corners, you can tell everything was done right and will last. We're so happy we went with his company and would 100% recommend"},
  {"src": "facebook", "name": "Liz J.", "label": "Facebook recommendation", "stars": null, "text": "We had a great experience with Shed Pro! They exceeded our expectations and had no problem with some changes we made on the day of the build. Their attention to detail is phenomenal and we highly recommend them!"},
  {"src": "google", "name": "Kseniya T.", "label": "Google review", "stars": 5, "text": "Fast and on-budget! We talked about designs on a Saturday and it was complete on Thursday, and they were able to accommodate all my special requests. Christian and his crew are so skilled and efficient, and left barely a screw or nail behind when they were done. Highly recommend!"},
  {"src": "facebook", "name": "Staci G.", "label": "Facebook recommendation", "stars": null, "text": "Cristian was great to work with. Wonderful communication through the entire process and very patient with all my questions. Shed looks great and very well built. I will be telling everyone I know about Shed Pro."},
  {"src": "google", "name": "Amanda C.", "label": "Google review", "stars": 5, "text": "Love love how my she-shed turned out! Christian and his crew came out and built it on site and it only took them two days to do so. I love it! Great communication also :)"},
  {"src": "facebook", "name": "Sharla H.", "label": "Facebook recommendation", "stars": null, "text": "Shed Pro did such a great job. I had a small back corner on my lot and needed extra storage. They built the shed onsite and I got maximum storage for my space. Quality work, high quality, easy to work with! It looks great. I'm so pleased!"},
  {"src": "google", "name": "Austen W.", "label": "Google review", "stars": 5, "text": "I’ve been debating building my own shed for years now. Once they came out and gave me a bid, I finally went with them. Best decision ever. What took them only 4-5 hours, would’ve taken me all summer. Superb quality, and it was exactly what I wanted. Highly recommend!"},
  {"src": "facebook", "name": "Rachel M.", "label": "Facebook recommendation", "stars": null, "text": "Shed Pro did an incredible job for us! We did a 12x14 barn style shed and they finished it in one day! I love how you can customize it to fit your budget and their prices were way better then any shed lot around or Home Depot. Highly recommend! We love our shed!"},
  {"src": "google", "name": "Scott H.", "label": "Google review", "stars": 5, "text": "I am very happy with my shed they built, they were very fast, they were there on time, and the quality is top notch!\nEverything I asked for they did, they were very kind and great to work with!! I would strongly recommend going with Shed Pro."},
  {"src": "google", "name": "Brian F.", "label": "Google review", "stars": 5, "text": "Six Stars! Shed Pro was easy to work with and did custom work fast. A high quality build at pricing below HomeDepot. It was a joy to work with them!"},
  {"src": "google", "name": "Rubi G.", "label": "Google review", "stars": 5, "text": "The customer service provided by ShedPro is top notch, and their sheds are absolutley beautiful. They pay great attention to detail, and it really shows in their craftsmanship. Highly recommend!"}
];
/* The real totals the home page shows (rating pills + #reviews header). */
var TOTALS = { google:{rating:'5.0', count:22}, facebook:{rec:'100%', count:21} };
var ALL_REVIEWS_URL = '/#reviews';
var GOOGLE_URL = 'https://search.google.com/local/reviews?placeid=ChIJwwlFnLcoHgERAfeFtnSUYNc';
DT.REVIEWS = REVIEWS; DT.TOTALS = TOTALS;

/* ── 2. PROMO (mirrors index.html PROMO block; remove after Nov 3, 2026) ── */
var PROMO = {
  ends: '2026-11-04T00:00:00',          // hides from Nov 4, 2026 (local), like the home page
  main: '$500 off a concrete pad when you buy a shed.',
  fine: 'Valid through Nov 3, 2026 while weather allows. Select sizes only. Ask your rep for details.'
};
DT.PROMO = PROMO;
DT.now = function(){ return new Date(); };            // tests override this
DT.promoActive = function(){ return DT.now() < new Date(PROMO.ends); };

function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function ss(k,v){ try{ if(v===undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k,v); }catch(e){ return null; } }
function reduced(){ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } }
var STAR='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"/></svg>';
var GMARK='<svg class="dt-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
var FMARK='<svg class="dt-g" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path fill="#fff" d="M13.4 19.5v-6.1h2.1l.3-2.4h-2.4V9.4c0-.7.2-1.2 1.2-1.2h1.3V6.1c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3V11H8.7v2.4h2.1v6.1z"/></svg>';
function rating(r){
  return r.src==='google'
    ? '<span class="dt-stars" role="img" aria-label="5 out of 5 stars">'+STAR+STAR+STAR+STAR+STAR+'</span>'
    : '<span class="dt-rec">Recommends</span>';
}
function mark(r){ return r.src==='google' ? GMARK : FMARK; }

var DISMISS_KEY='dt_reviews_dismissed';
var idx=0, timer=null, host=null, expanded=false;

function slideHTML(r){
  return '<span class="dt-src">'+mark(r)+rating(r)+'</span>'+
    '<span class="dt-q">\u201C'+esc(r.text.replace(/\s*\n\s*/g,' '))+'\u201D</span>'+
    '<span class="dt-who">'+esc(r.name)+' \u00B7 '+esc(r.label)+'</span>';
}
function cardHTML(){
  var picks=[0,1,2].map(function(k){ return REVIEWS[(idx+k)%REVIEWS.length]; });
  return '<div class="dt-card-h"><span class="dt-card-t">What customers say</span>'+
      '<button type="button" class="dt-x" data-act="collapse" aria-label="Collapse reviews">&#8211;</button></div>'+
    '<div class="dt-tot"><span class="dt-tg">'+GMARK+'<b>'+TOTALS.google.rating+'</b><span class="dt-stars" aria-hidden="true">'+STAR+STAR+STAR+STAR+STAR+'</span>'+
      '<span>'+TOTALS.google.count+' Google reviews</span></span>'+
      '<span class="dt-tg">'+FMARK+'<b>'+TOTALS.facebook.rec+'</b><span>recommend \u00B7 '+TOTALS.facebook.count+' Facebook reviews</span></span></div>'+
    picks.map(function(r){
      return '<figure class="dt-rv"><div class="dt-src">'+mark(r)+rating(r)+'</div>'+
        '<blockquote>'+esc(r.text)+'</blockquote><figcaption>'+esc(r.name)+' \u00B7 '+esc(r.label)+'</figcaption></figure>';
    }).join('')+
    '<div class="dt-links"><a href="'+ALL_REVIEWS_URL+'" target="_blank" rel="noopener">See all reviews</a>'+
      '<a href="'+GOOGLE_URL+'" target="_blank" rel="noopener">Read all '+TOTALS.google.count+' on Google</a></div>';
}
function render(){
  if(!host) return;
  host.classList.toggle('dt-open', expanded);
  if(expanded){
    host.innerHTML='<div class="dt-card" role="dialog" aria-label="ShedPro customer reviews">'+cardHTML()+'</div>';
  } else {
    host.innerHTML='<button type="button" class="dt-pill" data-act="expand" aria-label="Customer reviews: 5.0 stars from '+TOTALS.google.count+' Google reviews. Tap to read more.">'+
        '<span class="dt-slide dt-on" aria-live="off">'+slideHTML(REVIEWS[idx])+'</span></button>'+
      '<button type="button" class="dt-x dt-dismiss" data-act="dismiss" aria-label="Hide reviews">&times;</button>';
  }
}
function rotate(){
  if(!host || expanded) return;
  var cur=host.querySelector('.dt-slide'); if(!cur) return;
  idx=(idx+1)%REVIEWS.length;
  cur.classList.remove('dt-on');                       // fade out...
  setTimeout(function(){                               // ...swap, fade in
    if(expanded || !host) return;
    cur.innerHTML=slideHTML(REVIEWS[idx]);
    cur.classList.add('dt-on');
  }, 450);
}
function start(){ stop(); if(!reduced()) timer=setInterval(rotate, 7000); }
function stop(){ if(timer){ clearInterval(timer); timer=null; } }
DT.rotate=rotate;

/* Things that own the bottom of the 3D view while they are up. */
function shown(el){
  if(!el) return false;
  var s=getComputedStyle(el);
  return s.display!=='none' && s.visibility!=='hidden' && parseFloat(s.opacity)>0.05 && el.offsetWidth>0;
}
function blocked(){
  return shown(document.getElementById('duResume')) || shown(document.getElementById('consultNudge')) ||
    shown(document.getElementById('wallPick')) || shown(document.getElementById('editBadge')) ||
    shown(document.getElementById('toast')) || !!document.querySelector('.du-overlay, .dinfo[style*="flex"]') ||
    covers(document.getElementById('subPage'));
}
/* A panel (the quote form, option sub-pages) that is drawn over the 3D view. */
function covers(el){
  if(!host || !shown(el)) return false;
  var a=el.getBoundingClientRect(), b=host.getBoundingClientRect();
  return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
}
function syncVisible(){
  if(!host) return;
  var hide=blocked();
  if(hide && expanded){ expanded=false; render(); }
  host.classList.toggle('dt-hidden', hide);
}
DT.syncVisible=syncVisible;

function mountBubble(){
  if(ss(DISMISS_KEY)==='1') return;
  var vp=document.querySelector('.vp'); if(!vp || document.getElementById('dtBubble')) return;
  host=document.createElement('div');
  host.id='dtBubble'; host.className='dt-bub';
  if(reduced()) host.classList.add('dt-static');
  host.setAttribute('role','complementary'); host.setAttribute('aria-label','Customer reviews');
  vp.appendChild(host);
  host.addEventListener('click', function(e){
    var b=e.target.closest('[data-act]'); if(!b) return;
    e.stopPropagation();
    var a=b.getAttribute('data-act');
    if(a==='expand'){ expanded=true; render(); stop(); var x=host.querySelector('.dt-x'); if(x) try{ x.focus(); }catch(_){}
      if(window.DU && DU.track) DU.track('reviews_bubble_opened',{}); }
    else if(a==='collapse'){ expanded=false; render(); start(); }
    else if(a==='dismiss'){ ss(DISMISS_KEY,'1'); stop(); host.remove(); host=null; }
  });
  // Pointer events on the bubble must not rotate the shed underneath it.
  ['pointerdown','mousedown','touchstart','wheel'].forEach(function(t){
    host.addEventListener(t, function(e){ e.stopPropagation(); }, {passive:true});
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && expanded){ expanded=false; render(); start(); } });
  render(); start(); syncVisible();
  setInterval(syncVisible, 400);
}

/* ── promo placements ── */
DT.promoHTML = function(where){
  if(!DT.promoActive()) return '';
  return '<div class="dt-promo" data-promo-ends="2026-11-04" data-where="'+esc(where||'')+'">'+
    '<span class="dt-promo-tag">Limited-time offer</span>'+
    '<span class="dt-promo-main"><strong>$500 off a concrete pad</strong> when you buy a shed.</span>'+
    '<span class="dt-promo-fine">'+esc(PROMO.fine)+'</span></div>';
};
function mountFoundationPromo(){
  var list=document.getElementById('foundationList'); if(!list || document.getElementById('dtPromoFoundation')) return;
  var h=DT.promoHTML('foundation'); if(!h) return;
  var w=document.createElement('div'); w.id='dtPromoFoundation'; w.innerHTML=h;
  list.parentNode.insertBefore(w, list);
}
function hookReview(){
  if(!window.DU || !DU.renderReview || DU.renderReview._dt) return;
  var orig=DU.renderReview;
  DU.renderReview=function(host){
    var r=orig.apply(this, arguments);
    try{
      var h=DT.promoHTML('review');
      if(h && host && !host.querySelector('.dt-promo')){
        var act=host.querySelector('.du-rv-actions');
        var d=document.createElement('div'); d.innerHTML=h;
        host.insertBefore(d.firstChild, act||null);
      }
    }catch(e){}
    return r;
  };
  DU.renderReview._dt=true;
}

var CSS=''+
'.dt-bub{position:absolute;left:14px;bottom:14px;z-index:60;max-width:300px;font-family:inherit;transition:opacity .3s ease}'+
'.dt-bub.dt-hidden{opacity:0;pointer-events:none}'+
'.dt-pill{display:flex;flex-direction:column;gap:3px;text-align:left;width:100%;background:rgba(20,22,26,.86);color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:9px 30px 9px 11px;cursor:pointer;font:inherit;box-shadow:0 6px 18px rgba(0,0,0,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}'+
'.dt-pill:focus-visible,.dt-x:focus-visible,.dt-links a:focus-visible{outline:2px solid #2BB5E8;outline-offset:2px}'+
'.dt-slide{display:flex;flex-direction:column;gap:3px;opacity:0;transition:opacity .45s ease}.dt-slide.dt-on{opacity:1}'+
'.dt-static .dt-slide,.dt-static{transition:none}'+
'.dt-src{display:flex;align-items:center;gap:5px;line-height:1}'+
'.dt-g{width:14px;height:14px;flex:none}'+
'.dt-stars{display:inline-flex;gap:1px}.dt-stars svg{width:11px;height:11px;fill:#FBBC04}'+
'.dt-rec{font-size:10.5px;font-weight:700;color:#8fb7ff;letter-spacing:.02em}'+
'.dt-q{font-size:12px;line-height:1.35;color:#e9edf1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'+
'.dt-who{font-size:10.5px;color:#9aa4ae;font-weight:600}'+
'.dt-x{position:absolute;top:4px;right:4px;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#9aa4ae;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
'.dt-x:hover{color:#fff;background:rgba(255,255,255,.08)}'+
'.dt-card{position:relative;width:320px;max-width:calc(100vw - 28px);max-height:var(--dt-maxh,420px);overflow-y:auto;background:rgba(20,22,26,.97);color:#fff;border:1px solid rgba(43,181,232,.35);border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.5)}'+
'.dt-card .dt-x{position:static}'+
'.dt-card-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}'+
'.dt-card-t{font-size:13px;font-weight:800}'+
'.dt-tg{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.dt-tot{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;font-size:11px;color:#c6cdd4;margin-bottom:8px}.dt-tot b{color:#fff}.dt-sep{opacity:.5;margin:0 2px}'+
'.dt-rv{margin:0;padding:9px 0;border-top:1px solid rgba(255,255,255,.08)}'+
'.dt-rv blockquote{margin:6px 0 4px;font-size:12.5px;line-height:1.45;color:#e9edf1;white-space:pre-line}'+
'.dt-rv figcaption{font-size:11px;color:#9aa4ae;font-weight:600}'+
'.dt-links{display:flex;flex-wrap:wrap;gap:6px 14px;padding-top:9px;border-top:1px solid rgba(255,255,255,.08)}'+
'.dt-links a{font-size:12px;font-weight:700;color:#2BB5E8;text-decoration:none}.dt-links a:hover{text-decoration:underline}'+
/* phone: compact one-line pill above the "Drag to rotate" hint */
'@media (max-width:600px), (max-width:700px) and (max-aspect-ratio:5/7){'+
  '.dt-bub{left:8px;bottom:36px;max-width:min(260px,calc(100% - 16px))}'+
  '.dt-pill{padding:6px 28px 6px 9px;border-radius:10px;gap:2px}'+
  '.dt-slide{gap:2px}.dt-q{font-size:11px;-webkit-line-clamp:1}.dt-who{display:none}'+
  '.dt-x.dt-dismiss{top:1px;right:1px}'+
  '.dt-bub.dt-open{bottom:8px;right:8px;max-width:none}.dt-card{width:auto;max-width:none}'+
'}'+
'@media (prefers-reduced-motion:reduce){.dt-bub,.dt-slide{transition:none}}'+
/* promo */
'.dt-promo{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 10px;padding:9px 11px;border-radius:10px;background:linear-gradient(100deg,rgba(43,181,232,.14),rgba(43,181,232,.03) 70%);border:1px solid rgba(43,181,232,.28)}'+
'.dt-promo-tag{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#06222e;background:#2BB5E8;padding:3px 7px;border-radius:999px;line-height:1}'+
'.dt-promo-main{font-size:12.5px;color:#fff}.dt-promo-main strong{font-weight:800}'+
'.dt-promo-fine{flex-basis:100%;font-size:11px;color:#9aa4ae;line-height:1.35}'+
'.du-rv-note + .dt-promo,.du-rv + .dt-promo{margin-top:10px}';

function maxH(){
  if(!host) return;
  var vp=document.querySelector('.vp'); if(vp) host.style.setProperty('--dt-maxh', Math.max(160, vp.clientHeight-28)+'px');
}
function init(){
  if(!document.getElementById('dt-style')){
    var st=document.createElement('style'); st.id='dt-style'; st.textContent=CSS; document.head.appendChild(st);
  }
  mountFoundationPromo();
  hookReview();
  mountBubble(); maxH();
  window.addEventListener('resize', maxH);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
