/* ═══════════════════════════════════════════════════════════════════════════
   BRAND PAINT CODES — search Sherwin-Williams, Behr, Benjamin Moore, Valspar,
   PPG / Glidden and Dunn-Edwards colours by code or name and put them on the
   shed: siding, trim, doors and the painted interior.

   The colour books live in /paint-colors/<brand>.json (built from published
   brand data by scripts/paint/build_paint_colors.py — see SOURCES.md there).
   Nothing is fetched until someone focuses a search box, so the designer's
   first load is untouched. A query that names a brand ("SW 7006", "Behr …",
   "BM HC-172") loads only that brand's book.

   STATE. A brand pick is remembered per part as {brand, code, name, hex}. It
   only counts while the part still shows that exact colour under that exact
   label — pick a preset swatch, a scheme or a hex afterwards and the pick
   quietly stops being claimed, with no hooks in setColor/applyHex needed.
   Saved designs carry it as config.paint (and readable config.colorNames), so
   share links, autosave, the review screen and the quote all see e.g.
   "Sherwin-Williams SW 7006 Extra White".
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
var W=window;
var BASE='paint-colors/';
var BRANDS=[
  {b:'sw',      brand:'Sherwin-Williams', short:'SW',  alias:['sherwin williams','sherwinwilliams','sherwin','sw']},
  {b:'bm',      brand:'Benjamin Moore',   short:'BM',  alias:['benjamin moore','benjaminmoore','benjamin','ben moore','bm']},
  {b:'behr',    brand:'Behr',             short:'Behr',alias:['behr']},
  {b:'valspar', brand:'Valspar',          short:'Valspar', alias:['valspar']},
  {b:'ppg',     brand:'PPG / Glidden',    short:'PPG', alias:['ppg glidden','glidden','ppg']},
  {b:'de',      brand:'Dunn-Edwards',     short:'DE',  alias:['dunn edwards','dunnedwards','dunn','de']}
];
var BY={}; BRANDS.forEach(function(x,i){ x.rank=i; BY[x.b]=x; });
var PARTS={
  s:{label:'Siding', cfg:'siding'},
  t:{label:'Trim',   cfg:'trim'},
  d:{label:'Doors',  cfg:'door'},
  i:{label:'Interior walls', cfg:'interior'}
};
var NOTE='On-screen colors are approximate. We\'ll confirm your exact color with you before painting.';

var DATA={}, LOADING={};
var PICKS={};                       // part -> {brand, b, code, name, hex:'#RRGGBB'}
W.DOOR_PAINT = (typeof W.DOOR_PAINT==='number') ? W.DOOR_PAINT : null;   // read by buildDoor()

/* ── loading ── */
function load(b){
  if(DATA[b]) return Promise.resolve(DATA[b]);
  if(!LOADING[b]){
    LOADING[b]=fetch(BASE+b+'.json').then(function(r){
      if(!r.ok) throw new Error('paint '+b+' '+r.status);
      return r.json();
    }).then(function(d){ DATA[b]=d; return d; })
      .catch(function(e){ delete LOADING[b]; throw e; });
  }
  return LOADING[b];
}
function loadAll(list){
  return Promise.all((list||BRANDS.map(function(x){return x.b;})).map(function(b){
    return load(b).catch(function(){ return null; });
  }));
}

/* ── query parsing + search ── */
function fold(s){
  s=String(s||'');
  try{ s=s.normalize('NFKD').replace(/[\u0300-\u036f]/g,''); }catch(e){}
  return s.toLowerCase().replace(/[\u00ae\u2122]/g,'');
}
function compact(s){ return fold(s).replace(/[^a-z0-9]/g,''); }
function parseQuery(q){
  var s=fold(q).replace(/[-_.,\/]+/g,' ').replace(/'/g,'').replace(/\s+/g,' ').trim();
  var brand=null, rest=s;
  outer: for(var i=0;i<BRANDS.length;i++){
    var al=BRANDS[i].alias;
    for(var j=0;j<al.length;j++){
      var a=al[j];
      if(s===a || s.indexOf(a+' ')===0 || (s.indexOf(a)===0 && /\d/.test(s.charAt(a.length)))){
        brand=BRANDS[i].b; rest=s.slice(a.length).trim(); break outer;
      }
    }
  }
  return { brand:brand, full:compact(s), rest:rest, restC:compact(rest),
           words:rest.replace(/[^a-z0-9 ]/g,' ').split(' ').filter(Boolean) };
}
function scoreEntry(e, P){
  var k=e[3], bar=k.indexOf('|'), codes=k.slice(0,bar), name=k.slice(bar+1), best=0;
  if(/\d/.test(P.full)){
    var toks=codes.split(' ');
    for(var i=0;i<toks.length;i++){
      var t=toks[i];
      if(t===P.restC || t===P.full) best=Math.max(best,100);
      else if(P.restC && t.indexOf(P.restC)===0) best=Math.max(best, 80-(t.length-P.restC.length));
      else if(t.indexOf(P.full)===0) best=Math.max(best, 78-(t.length-P.full.length));
    }
  }
  if(P.words.length){
    var rest=P.words.join(' ');
    if(name===rest) best=Math.max(best,96);
    else if(name.indexOf(rest)===0) best=Math.max(best,86);
    else {
      var nw=name.split(' '), all=true;
      for(var w=0;w<P.words.length && all;w++){
        var hit=false;
        for(var x=0;x<nw.length;x++) if(nw[x].indexOf(P.words[w])===0){ hit=true; break; }
        all=hit;
      }
      if(all) best=Math.max(best,70);
      else if(rest.length>=4 && name.indexOf(rest)>=0) best=Math.max(best,50);
    }
  }
  return best;
}
/* Synchronous over whatever is loaded. Returns up to `limit` hits, best first;
   ties go to the more common brand, then the shorter name. */
function search(q, limit){
  var P=parseQuery(q), out=[];
  if(!P.full || (P.brand && !P.restC)) return {P:P, hits:out};
  var list=P.brand ? [P.brand] : BRANDS.map(function(x){return x.b;});
  list.forEach(function(b){
    var d=DATA[b]; if(!d) return;
    for(var i=0;i<d.c.length;i++){
      var sc=scoreEntry(d.c[i], P);
      if(sc>0) out.push({s:sc, b:b, e:d.c[i]});
    }
  });
  out.sort(function(a,z){
    return (z.s-a.s) || (BY[a.b].rank-BY[z.b].rank) || (a.e[1].length-z.e[1].length);
  });
  return {P:P, hits:out.slice(0, limit||40)};
}
function brandsFor(q){
  var P=parseQuery(q);
  return P.brand ? [P.brand] : BRANDS.map(function(x){return x.b;});
}

/* ── state ── */
function label(p){ return p.brand+' '+p.code+' '+p.name; }
function hexInt(p){ return parseInt(String(p.hex).replace('#',''),16); }
function curHex(part){
  if(part==='s') return W.sc; if(part==='t') return W.tc;
  if(part==='i') return W.ipc; if(part==='d') return W.DOOR_PAINT;
}
function curName(part){
  if(part==='s') return W.sn; if(part==='t') return W.tn; if(part==='i') return W.ipn;
  return null;
}
/* A pick is live only while the part still shows it. */
function livePick(part){
  var p=PICKS[part]; if(!p) return null;
  if(curHex(part)!==hexInt(p)) return null;
  if(part!=='d' && curName(part)!==label(p)) return null;
  return p;
}
function applyPick(part, b, e){
  var br=BY[b];
  var p={brand:br.brand, b:b, code:e[0], name:e[1], hex:'#'+e[2]};
  var hex=hexInt(p), lab=label(p);
  PICKS[part]=p;
  if(part==='s'){ W.sc=hex; W.sn=lab; swatch('hexSwatch', p.hex); }
  if(part==='t'){ W.tc=hex; W.tn=lab; if(W.TRIM_FINISH==='cedar') W.TRIM_FINISH='paint'; swatch('hexSwatchTrim', p.hex); }
  if(part==='d'){ W.DOOR_PAINT=hex; }
  if(part==='i'){
    if(typeof W.setInteriorColor==='function') W.setInteriorColor(hex, lab);
    else { W.ipc=hex; W.ipn=lab; }
  }
  if(part==='s'||part==='t'){
    if(typeof W.renderWallColors==='function') W.renderWallColors();
    if(typeof W.buildShed==='function') W.buildShed();
  } else if(part==='d'){
    if(typeof W.buildShed==='function') W.buildShed();
  }
  refreshAll();
  try{ if(W.DU && DU.track) DU.track('paint_code_applied', {part:PARTS[part].cfg, brand:b}); }catch(err){}
}
function swatch(id, hx){ var el=document.getElementById(id); if(el) el.style.background=hx; }
function clearDoor(){
  delete PICKS.d; W.DOOR_PAINT=null;
  if(typeof W.buildShed==='function') W.buildShed();
  refreshAll();
}

/* ── config: getDesignConfig / applyDesignConfig call these ── */
function decorateConfig(c){
  if(!c) return c;
  var paint={}, any=false;
  Object.keys(PARTS).forEach(function(part){
    var p=livePick(part);
    if(p){ paint[PARTS[part].cfg]={brand:p.brand, code:p.code, name:p.name, hex:p.hex}; any=true; }
  });
  if(any) c.paint=paint;
  if(typeof W.DOOR_PAINT==='number') c.doorColor=W.DOOR_PAINT;
  if(typeof W.ipc==='number') c.intColor=W.ipc;
  var names={};
  if(W.SIDING!=='pine' && W.sn) names.siding=String(W.sn);
  if(W.tn) names.trim=(W.TRIM_FINISH==='cedar') ? 'Natural cedar' : String(W.tn);
  if(W.rn) names.roof=String(W.rn);
  if(typeof W.DOOR_PAINT==='number'){
    var dp=livePick('d');
    names.door=dp ? label(dp) : ('#'+hex6(W.DOOR_PAINT));
  }
  if(W.INT_FINISH==='painted' && W.ipn) names.interior=String(W.ipn);
  c.colorNames=names;
  return c;
}
function hex6(n){ return ('000000'+(n>>>0).toString(16)).slice(-6).toUpperCase(); }
function restoreConfig(c){
  if(!c) return;
  PICKS={};
  var paint=(c.paint && typeof c.paint==='object') ? c.paint : {};
  var want={s:c.sidingColor, t:c.trimColor, d:c.doorColor, i:c.intColor};
  Object.keys(PARTS).forEach(function(part){
    var p=paint[PARTS[part].cfg];
    if(!p || !p.brand || !p.code || !/^#?[0-9a-fA-F]{6}$/.test(String(p.hex||''))) return;
    var hx='#'+String(p.hex).replace('#','').toUpperCase();
    if(want[part]!=null && +want[part]!==parseInt(hx.slice(1),16)) return;   // stale: colour moved on
    var b=null; BRANDS.forEach(function(x){ if(x.brand===p.brand) b=x.b; });
    PICKS[part]={brand:String(p.brand), b:b, code:String(p.code), name:String(p.name||''), hex:hx};
  });
  W.DOOR_PAINT=(c.doorColor!=null && isFinite(+c.doorColor)) ? +c.doorColor : null;
  if(c.intColor!=null && isFinite(+c.intColor)){
    W.ipc=+c.intColor;
    W.ipn=PICKS.i ? label(PICKS.i)
        : (c.colorNames && c.colorNames.interior) ? String(c.colorNames.interior) : W.ipn;
  }
  if(PICKS.s) W.sn=label(PICKS.s);
  else if(c.colorNames && c.colorNames.siding) W.sn=String(c.colorNames.siding);
  if(PICKS.t) W.tn=label(PICKS.t);
  else if(c.colorNames && c.colorNames.trim && c.colorNames.trim!=='Natural cedar') W.tn=String(c.colorNames.trim);
  refreshAll();
}

/* ── UI ── */
var CSS=''+
'.pc{margin-top:10px}'+
'.pc-lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--mu,#9aa);margin-bottom:5px}'+
'.pc-in{width:100%;box-sizing:border-box;background:var(--d3,#1b1f24);border:1px solid var(--br,#333);border-radius:8px;'+
  'padding:10px 11px;color:var(--w,#fff);font:600 14px/1.2 Barlow,sans-serif;-webkit-appearance:none;appearance:none}'+
'.pc-in:focus{outline:none;border-color:#2BB5E8;box-shadow:0 0 0 2px rgba(43,181,232,.25)}'+
'.pc-in::placeholder{color:var(--mu,#889);font-weight:500}'+
'.pc-list{margin-top:6px;max-height:264px;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:9px;'+
  'border:1px solid var(--br,#333);background:var(--d2,#14181c)}'+
'.pc-list:empty{display:none}'+
'.pc-opt{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:8px 10px;min-height:46px;'+
  'background:none;border:0;border-bottom:1px solid rgba(255,255,255,.06);color:var(--w,#fff);text-align:left;cursor:pointer;font:inherit}'+
'.pc-opt:last-child{border-bottom:0}'+
'.pc-opt:hover,.pc-opt.on{background:rgba(43,181,232,.12)}'+
'.pc-sw{flex:0 0 30px;width:30px;height:30px;border-radius:6px;border:1px solid rgba(255,255,255,.22)}'+
'.pc-tx{min-width:0;flex:1}'+
'.pc-nm{display:block;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.pc-cd{display:block;font-size:11px;color:var(--mu,#9aa);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'.pc-msg{padding:10px 11px;font-size:12px;color:var(--mu,#9aa)}'+
'.pc-pick{display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px 10px;border-radius:9px;'+
  'background:rgba(43,181,232,.10);border:1px solid rgba(43,181,232,.45)}'+
'.pc-pick[hidden]{display:none}'+
'.pc-pick .pc-x{flex:0 0 auto;background:none;border:1px solid var(--br,#333);color:var(--w,#fff);border-radius:7px;'+
  'padding:6px 9px;font:700 11px Barlow,sans-serif;cursor:pointer}'+
'.pc-note{font-size:10.5px;line-height:1.4;color:var(--mu,#9aa);margin-top:6px}'+
'.pc-door-btns{display:flex;gap:8px;margin-bottom:2px}'+
'.pc-door-btns button{flex:1;padding:9px;border-radius:8px;font:700 12px Barlow,sans-serif;color:var(--w,#fff);cursor:pointer;'+
  'background:var(--d3,#1b1f24);border:1px solid var(--br,#333)}'+
'.pc-door-btns button.on{background:rgba(43,181,232,.14);border-color:#2BB5E8}'+
'.pc-dis{opacity:.45;pointer-events:none}';

function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
var HOSTS={};
function mount(host){
  var part=host.getAttribute('data-part'); if(!PARTS[part] || HOSTS[part]) return;
  var id='pc-'+part;
  host.className+=' pc';
  host.innerHTML=
    (part==='d' ? '<div class="pc-door-btns"><button type="button" class="pc-match">Match siding</button>'+
                  '<button type="button" class="pc-own">Paint code</button></div>' : '')+
    '<div class="pc-body">'+
    '<label class="pc-lbl" for="'+id+'-in">'+(part==='d'?'Door paint: brand code or name':'Brand paint: code or name')+'</label>'+
    '<input class="pc-in" id="'+id+'-in" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" '+
      'autocapitalize="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" '+
      'aria-controls="'+id+'-list" placeholder="e.g. SW 7006, Revere Pewter, Behr PPU18-06">'+
    '<div class="pc-list" id="'+id+'-list" role="listbox" aria-label="Matching paint colors"></div>'+
    '<div class="pc-pick" hidden><span class="pc-sw"></span><span class="pc-tx"><span class="pc-nm"></span>'+
      '<span class="pc-cd"></span></span><button type="button" class="pc-x" aria-label="Clear brand color">Change</button></div>'+
    '</div>'+
    '<div class="pc-note">'+NOTE+(part==='d'?' Applies to the shed-built doors; roll-up, residential, glass and cedar doors keep their own finish.':'')+'</div>';
  var ui={host:host, part:part, input:host.querySelector('.pc-in'), list:host.querySelector('.pc-list'),
          pick:host.querySelector('.pc-pick'), body:host.querySelector('.pc-body'), hits:[], active:-1, seq:0};
  HOSTS[part]=ui;
  var timer=null;
  // Warm the most-asked-for book on focus; everything else waits for a query.
  ui.input.addEventListener('focus', function(){ load('sw').catch(function(){}); });
  ui.input.addEventListener('input', function(){ clearTimeout(timer); timer=setTimeout(function(){ run(ui); }, 90); });
  ui.input.addEventListener('keydown', function(e){
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      if(!ui.hits.length) return; e.preventDefault();
      ui.active=(ui.active+(e.key==='ArrowDown'?1:-1)+ui.hits.length)%ui.hits.length; paintActive(ui);
    } else if(e.key==='Enter'){
      e.preventDefault();
      var h=ui.hits[ui.active>=0?ui.active:0]; if(h) choose(ui,h);
    } else if(e.key==='Escape'){ closeList(ui); }
  });
  ui.list.addEventListener('click', function(e){
    var b=e.target.closest ? e.target.closest('.pc-opt') : null; if(!b) return;
    var h=ui.hits[+b.getAttribute('data-i')]; if(h) choose(ui,h);
  });
  ui.pick.querySelector('.pc-x').addEventListener('click', function(){
    ui.pick.hidden=true; ui.input.value=''; ui.input.focus();
  });
  if(part==='d'){
    host.querySelector('.pc-match').addEventListener('click', function(){ ui.ownMode=false; clearDoor(); });
    host.querySelector('.pc-own').addEventListener('click', function(){ ui.ownMode=true; refresh(ui); ui.input.focus(); });
  }
  refresh(ui);
}
function closeList(ui){ ui.shown=false; ui.list.innerHTML=''; ui.hits=[]; ui.active=-1; ui.input.setAttribute('aria-expanded','false'); }
function paintActive(ui){
  var opts=ui.list.querySelectorAll('.pc-opt');
  for(var i=0;i<opts.length;i++){
    var on=(i===ui.active); opts[i].classList.toggle('on', on); opts[i].setAttribute('aria-selected', String(on));
    if(on && opts[i].scrollIntoView) opts[i].scrollIntoView({block:'nearest'});
  }
}
function run(ui){
  var q=ui.input.value||'';
  var seq=++ui.seq;
  if(!compact(q)){ closeList(ui); return; }
  var need=brandsFor(q).filter(function(b){ return !DATA[b]; });
  render(ui, q, need.length>0);
  if(need.length){
    loadAll(need).then(function(){ if(seq===ui.seq) render(ui, q, false); });
  }
}
function render(ui, q, stillLoading){
  var r=search(q, 40);
  ui.hits=r.hits; ui.active=-1;
  ui.input.setAttribute('aria-expanded', 'true');
  if(!r.hits.length){
    var P=r.P, msg;
    if(stillLoading) msg='Loading paint colors\u2026';
    else if(P.brand && !P.restC) msg='Now type a '+BY[P.brand].brand+' code or color name.';
    else {
      var failed=brandsFor(q).filter(function(b){ return !DATA[b]; }).length;
      msg = failed ? 'Couldn\u2019t load the paint colors. Check your connection and try again.'
                   : 'No match. Try the code on the chip (like SW 7006) or the color name.';
    }
    ui.list.innerHTML='<div class="pc-msg">'+esc(msg)+'</div>';
    return;
  }
  ui.list.innerHTML=r.hits.map(function(h,i){
    var e=h.e;
    return '<button type="button" class="pc-opt" role="option" aria-selected="false" data-i="'+i+'">'+
      '<span class="pc-sw" style="background:#'+e[2]+'"></span>'+
      '<span class="pc-tx"><span class="pc-nm">'+esc(e[1])+'</span>'+
      '<span class="pc-cd">'+esc(BY[h.b].brand+' \u00b7 '+e[0])+'</span></span></button>';
  }).join('')+(stillLoading?'<div class="pc-msg">Loading more brands\u2026</div>':'');
  // The results open under the box; on a short panel they'd be off the bottom.
  if(!ui.shown && ui.list.scrollIntoView){ ui.shown=true; try{ ui.list.scrollIntoView({block:'nearest'}); }catch(e){} }
}
function choose(ui,h){
  applyPick(ui.part, h.b, h.e);
  ui.input.value=''; closeList(ui); ui.input.blur();
}
function refresh(ui){
  var part=ui.part, p=livePick(part);
  if(part==='s'){
    var pine=(W.SIDING==='pine');
    ui.host.style.display=pine?'none':'';
  }
  if(part==='d'){
    var own=(typeof W.DOOR_PAINT==='number') || !!ui.ownMode;
    ui.host.querySelector('.pc-match').classList.toggle('on', !own);
    ui.host.querySelector('.pc-own').classList.toggle('on', own);
    ui.body.style.display=own?'':'none';
  }
  if(p){
    ui.pick.hidden=false;
    ui.pick.querySelector('.pc-sw').style.background=p.hex;
    ui.pick.querySelector('.pc-nm').textContent=p.name;
    ui.pick.querySelector('.pc-cd').textContent=p.brand+' \u00b7 '+p.code;
  } else {
    ui.pick.hidden=true;
  }
}
function refreshAll(){ Object.keys(HOSTS).forEach(function(k){ refresh(HOSTS[k]); }); }

/* Every swatch, scheme and hex path ends in one of these re-renders, so
   hanging the refresh off them keeps the pick chip honest with no edits to
   the setters themselves. */
function wrap(name){
  var f=W[name]; if(typeof f!=='function' || f.__pc) return;
  var g=function(){ var r=f.apply(this, arguments); try{ refreshAll(); }catch(e){} return r; };
  g.__pc=true; W[name]=g;
}
function boot(){
  if(!document.getElementById('pc-style')){
    var st=document.createElement('style'); st.id='pc-style'; st.textContent=CSS; document.head.appendChild(st);
  }
  var hosts=document.querySelectorAll('.pc-host[data-part]');
  for(var i=0;i<hosts.length;i++) mount(hosts[i]);
  ['renderWallColors','renderInteriorColors','setSiding'].forEach(wrap);
  refreshAll();
}

W.PC={ search:search, parseQuery:parseQuery, load:load, loadAll:loadAll, applyPick:applyPick,
       decorateConfig:decorateConfig, restoreConfig:restoreConfig, livePick:livePick,
       picks:function(){ return PICKS; }, brands:BRANDS, _data:DATA, refresh:refreshAll, NOTE:NOTE };
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
