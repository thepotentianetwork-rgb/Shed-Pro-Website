/* designer-realism.js: makes the 3D view look closer to a photograph without
   touching geometry or options. Loaded after designer.html's own script.

   - Photographic Wasatch backdrop (day + blue-hour dusk) on a ring around the
     yard, soft sky gradient above it, matching fog so the lawn meets it.
   - Real lawn texture with large-scale variation so it never reads as a tile.
   - Poured-concrete look on the pad.
   - Lighting rigs: daylight keeps DAY_RIG (the tested sun position); dusk is a
     blue-hour rig with a warm last-light key, cool sky fill and soft shadows.
   - Warm window/door glow and porch-light wall wash when electrical is on.
   - The ground logo decals are removed.
   - Two quality tiers: 'high' (desktop) and 'low' (phones / low-memory
     devices: lower resolution, smaller cheaper shadows, smaller textures,
     and frame skipping when the view is idle). Force with ?q=low / ?q=high.

   Everything hooks in from outside (wrapping buildShed and applyLighting), so
   if this file fails to load the designer still works exactly as before. */
(function(){
'use strict';
var DR = window.DR = window.DR || {};
var ENV = 'designer-env/';

/* ── quality tier ── */
DR.tier = (function(){
  var m=/[?&]q=(low|high)\b/.exec(location.search); if(m) return m[1];
  var coarse=false; try{ coarse=matchMedia('(pointer:coarse)').matches; }catch(e){}
  var small=Math.min(screen.width||9999, screen.height||9999)<=900;
  if(coarse && small) return 'low';
  if(navigator.deviceMemory && navigator.deviceMemory<=4) return 'low';
  if(navigator.hardwareConcurrency && navigator.hardwareConcurrency<=4) return 'low';
  return 'high';
})();
var LOW = DR.tier==='low';
document.documentElement.classList.add('dr-'+DR.tier);

/* ── texture helpers ── */
function canvasTex(w,h,draw,srgb){
  var c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  var t=new THREE.CanvasTexture(c); if(srgb) t.encoding=THREE.sRGBEncoding; return t;
}
function gradientTex(stops){
  return canvasTex(4,256,function(x,w,h){
    var g=x.createLinearGradient(0,0,0,h);
    stops.forEach(function(s){ g.addColorStop(s[0],s[1]); });
    x.fillStyle=g; x.fillRect(0,0,w,h);
  },true);
}
function loadTex(url, srgb, cb){
  return new THREE.TextureLoader().load(url, function(t){ if(cb) cb(t); markActive(); }, undefined, function(){});
}

/* Sky colours sampled from the two backdrop photos, so the dome above the ring
   continues the photo's own sky. */
var SKY = {
  day:  [[0,'#3f73b8'],[0.45,'#5f8fcb'],[0.75,'#8fb2dc'],[1,'#b9cfe6']],
  dusk: [[0,'#203a7a'],[0.40,'#2f4f98'],[0.70,'#4d63a8'],[1,'#7d76b0']]
};
var FOG = { day:{c:0x7f9a7a, near:22, far:78}, dusk:{c:0x262c3c, near:20, far:70} };
/* Environment (reflection) maps: what glossy paint, metal and glass reflect. */
var ENVGRAD = {
  day:  [[0,'#cfe0f2'],[0.45,'#b9cde3'],[0.55,'#9aa79a'],[1,'#56683f']],
  dusk: [[0,'#2c3f74'],[0.45,'#55618f'],[0.52,'#b98a7a'],[0.58,'#2a3040'],[1,'#141a12']]
};

var st = { ready:false, mode:null, ground:null, ring:null, ringTex:{}, skyTex:{}, envTex:{},
           concrete:null, lastActive:0, camKey:'' };

function markActive(){ st.lastActive=performance.now(); }
DR.markActive = markActive;

function buildEnv(stops){
  try{
    var t=gradientTex(stops); t.mapping=THREE.EquirectangularReflectionMapping;
    var pm=new THREE.PMREMGenerator(renderer); var rt=pm.fromEquirectangular(t);
    t.dispose(); pm.dispose(); return rt.texture;
  }catch(e){ return null; }
}

/* ── lawn ── */
function macroNoise(){
  return canvasTex(256,256,function(x,w,h){
    x.fillStyle='rgb(128,128,128)'; x.fillRect(0,0,w,h);
    for(var i=0;i<260;i++){
      var px=Math.random()*w, py=Math.random()*h, r=10+Math.random()*48, v=Math.random();
      var g=x.createRadialGradient(px,py,0,px,py,r);
      var c=(v>0.5?'255,255,255':'0,0,0');
      g.addColorStop(0,'rgba('+c+','+(0.10+Math.random()*0.14)+')'); g.addColorStop(1,'rgba('+c+',0)');
      x.fillStyle=g;
      [[0,0],[w,0],[-w,0],[0,h],[0,-h]].forEach(function(o){ x.beginPath(); x.arc(px+o[0],py+o[1],r,0,Math.PI*2); x.fill(); });
    }
  },false);
}
function setupGround(){
  var gnd=null;
  scene.children.forEach(function(o){
    if(o.isMesh && o.geometry && o.geometry.type==='PlaneGeometry' && o.geometry.parameters &&
       o.geometry.parameters.width===60 && o.material && o.material.map) gnd=o;
  });
  if(!gnd) return;
  var R=80, TILE=0.55;                       // world units per lawn tile (~2.75 ft)
  gnd.geometry.dispose();
  gnd.geometry=new THREE.CircleGeometry(R, 72);
  var mat=new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.97, metalness:0});
  var macro=macroNoise(); macro.wrapS=macro.wrapT=THREE.RepeatWrapping;
  mat.onBeforeCompile=function(sh){
    sh.uniforms.uMacro={value:macro};
    sh.fragmentShader='uniform sampler2D uMacro;\n'+sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\n'+
      '  float mA=texture2D(uMacro, vUv*0.0061).r; float mB=texture2D(uMacro, vUv*0.027+vec2(0.37,0.11)).r;\n'+
      '  diffuseColor.rgb*=mix(0.70,1.18,mA)*mix(0.88,1.08,mB);\n');
  };
  var old=gnd.material;
  // Start on the old procedural grass (so the shader always has a map/vUv), then swap in the photo.
  if(old && old.map){ mat.map=old.map; old.map.repeat.set(2*R/3.2, 2*R/3.2); }
  gnd.material=mat; if(old) old.dispose();
  loadTex(ENV+(LOW?'lawn-512.webp':'lawn-1024.webp'), true, function(t){
    t.encoding=THREE.sRGBEncoding; t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(2*R/TILE, 2*R/TILE); t.anisotropy=Math.min(LOW?4:8, renderer.capabilities.getMaxAnisotropy());
    mat.map=t; mat.needsUpdate=true;
  });
  gnd.receiveShadow=true;
  st.ground=gnd; st.lawnMat=mat;
}

/* ── backdrop ring ── */
var RING_COPIES=7;
function setupRing(){
  /* Height kept from the original 6-copy ring so the horizon line and framing
     don't move; the seamless tile (see realism/seam.py) repeats RING_COPIES
     times around without mirroring, so there is no symmetric seam to spot. */
  var R=36, H=(2*Math.PI*R/6)*(1024/1536), Y0=-3.2;
  var geo=new THREE.CylinderGeometry(R,R,H,96,1,true);
  var mat=new THREE.MeshBasicMaterial({side:THREE.BackSide, transparent:true, depthWrite:false, fog:false, toneMapped:false, color:0xffffff});
  var ring=new THREE.Mesh(geo, mat);
  ring.position.y=Y0+H/2; ring.rotation.y=0.2; ring.renderOrder=-1;
  ring.visible=false;
  scene.add(ring); st.ring=ring;
}
function ringTexture(mode, cb){
  if(st.ringTex[mode]) return cb(st.ringTex[mode]);
  loadTex(ENV+'backdrop-'+mode+'-tile'+(LOW?'-1k':'')+'.webp', true, function(t){
    t.encoding=THREE.sRGBEncoding; t.wrapS=THREE.RepeatWrapping; t.repeat.set(RING_COPIES,1);
    t.anisotropy=Math.min(4, renderer.capabilities.getMaxAnisotropy());
    st.ringTex[mode]=t; cb(t);
  });
}

/* ── concrete pad ── */
function concreteTex(){
  if(st.concrete) return st.concrete;
  var t=canvasTex(512,512,function(x,w,h){
    x.fillStyle='#bdbcb6'; x.fillRect(0,0,w,h);
    var id=x.getImageData(0,0,w,h), d=id.data;
    for(var i=0;i<d.length;i+=4){ var n=(Math.random()-0.5)*18; d[i]+=n; d[i+1]+=n; d[i+2]+=n*0.9; }
    x.putImageData(id,0,0);
    for(var k=0;k<90;k++){                     // soft trowel mottling
      var px=Math.random()*w, py=Math.random()*h, r=20+Math.random()*70, dark=Math.random()<0.5;
      var g=x.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,dark?'rgba(90,88,82,0.10)':'rgba(255,255,250,0.08)'); g.addColorStop(1,'rgba(0,0,0,0)');
      x.fillStyle=g; x.fillRect(px-r,py-r,r*2,r*2);
    }
    for(var s=0;s<900;s++){                    // aggregate specks
      x.fillStyle='rgba('+(Math.random()<0.5?'70,68,64':'235,233,226')+','+(0.25+Math.random()*0.35)+')';
      x.fillRect(Math.random()*w, Math.random()*h, 1+Math.random()*1.4, 1+Math.random()*1.4);
    }
  },true);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  st.concrete=t; return t;
}
var PAD_THK=4*0.2/12;
function dressPad(m){
  var p=m.geometry && m.geometry.parameters; if(!p || Math.abs(p.height-PAD_THK)>1e-4) return;
  var c=m.material && m.material.color && m.material.color.getHex();
  if(c!==0xc4c4bf && c!==0xb2b3ad) return;
  if(m.userData.drPad) return; m.userData.drPad=true;
  var t=concreteTex().clone(); t.needsUpdate=true;
  t.repeat.set(Math.max(1,p.width/0.9), Math.max(1,p.depth/0.9));   // ~4.5 ft per tile
  m.material.map=t; m.material.color.setHex(c===0xc4c4bf?0xe2e1dc:0xc9c8c2);
  m.material.roughness=0.93; m.material.needsUpdate=true;
}

/* ── board & batten: give the battens the wall's paint finish ── */
function dressBatten(m){
  if(typeof SIDING==='undefined' || SIDING!=='board-batten') return;
  var mt=m.material; if(!mt || !mt.isMeshStandardMaterial || mt.map || mt.userData.drBat) return;
  if(Math.abs(mt.roughness-0.62)>0.005 || mt.color.getHex()!==sc) return;
  mt.userData.drBat=true;
  /* Battens used to be darkened here by the wall map's average, because the
     walls multiplied the paint colour in twice (map x colour) and so rendered
     darker than the plain battens. sidingMat no longer does that and flat
     colours are decoded from sRGB in the shader (installSRGBMaterialColors),
     so a batten and the wall behind it already render the same paint. Only
     the finish is matched now. */
  mt.roughness=0.8; mt.envMapIntensity=0.6; mt.needsUpdate=true;
}

/* ── warm glow ── */
function isGlass(mat){
  if(!mat || !mat.isMeshBasicMaterial || !mat.transparent) return false;
  var h=mat.color.getHex();
  return (h===0xffe9c4 && Math.abs(mat.opacity-0.10)<1e-3) || (h===0xdfeaf0 && Math.abs(mat.opacity-0.045)<1e-3);
}
/* ── PORCH LIGHT REALISM (Nov 2026) ─────────────────────────────────────────
   The old dressing was one recipe for every fixture: a trapezoid-masked radial
   gradient (a hard triangular cone), a big additive halo sprite and a point
   light pushed to 0.9. On pale siding that burned a white wedge into the wall.
   Now each fixture gets light that matches what it physically is:
     modern cylinder  - downlight: a ~35deg half-angle pool on the siding below
     updown cylinder  - same body, light both up and down (narrower beams)
     craftsman lantern- glass on all sides: a soft round glow, a little biased down
     classic jar      - frosted dome: broad, even, round glow
   The wash is a procedural texture with inverse-square-ish falloff and a
   gaussian angular edge (no straight sides, no hard mouth), clipped at the
   wall top / porch ceiling so it can never climb onto the roof, and dimmed by
   the siding's own brightness so white paint warms instead of washing out.
   Cost: zero extra lights for the wash/diffuser; real PointLights only on the
   first PL_REAL_MAX fixtures (none on 'low' tier beyond 2), no shadow maps. */
var PL_PROFILE={
  modern:   {beams:[{dir:-1, half:0.62, reach:0.95}], diffY:-0.080, diffR:0.026, real:{y:-0.20, z:0.17, i:0.40, d:1.3}},
  updown:   {beams:[{dir:-1, half:0.42, reach:0.75},{dir:1, half:0.42, reach:0.60}], diffY:-0.080, diffR:0.026, real:{y:-0.05, z:0.16, i:0.38, d:1.2}},
  craftsman:{beams:[{dir:0, half:1.2, reach:0.55, bias:0.35}], diffY:0, diffR:0.04, real:{y:0, z:0.08, i:0.45, d:1.0}},
  classic:  {beams:[{dir:0, half:1.4, reach:0.50, bias:0.1}], diffY:0, diffR:0.045, real:{y:0, z:0.07, i:0.42, d:0.95}}
};
DR.PL_PROFILE=PL_PROFILE;
var PL_REAL_MAX=LOW?2:4;
function plProfile(style){ return PL_PROFILE[style] || PL_PROFILE.modern; }
var _plTex={};
function plWarmRGB(){
  // Bulb colour from the electrical step, nudged toward incandescent warmth so
  // even "Bright White" reads as a lamp, never as a white hotspot.
  var h=(typeof bulbHex==='function')?bulbHex():0xFFD9AE;
  var r=(h>>16)&255, g=(h>>8)&255, b=h&255;
  return [Math.round(r*0.85+255*0.15), Math.round(g*0.85+205*0.15), Math.round(b*0.85+150*0.15)];
}
/* One canvas per (beam shape, bulb). Source sits at (cx, sy) in the canvas;
   dir -1 = light travels down the canvas, 1 = up, 0 = all round. */
function plWashTex(beam){
  var rgb=plWarmRGB(), key=[beam.dir,beam.half,beam.bias||0,rgb.join('.')].join('|');
  if(_plTex[key]) return _plTex[key];
  var W=96, H=beam.dir===0?160:192, c=document.createElement('canvas'); c.width=W; c.height=H;
  var g=c.getContext('2d'), img=g.createImageData(W,H);
  var sx=(W-1)/2, sy=beam.dir===-1?4:(beam.dir===1?H-5:H*0.42), R=beam.dir===0?H*0.58:H*0.97;
  for(var y=0;y<H;y++) for(var x=0;x<W;x++){
    var dx=(x-sx)/R, dy=(y-sy)/R, along=beam.dir===-1?dy:(beam.dir===1?-dy:0);
    var r=Math.sqrt(dx*dx+dy*dy), a;
    if(beam.dir===0){
      // round glow, a touch stronger below the lamp (the cap shades the top)
      var bias=1+(beam.bias||0)*Math.max(-1,Math.min(1,dy/Math.max(r,1e-3)));
      a=bias/(1+Math.pow(r/0.16,2));
    } else {
      if(along<=0){ a=0; }
      else {
        var th=Math.atan2(Math.abs(dx), along);
        a=Math.exp(-Math.pow(th/beam.half,2)*1.6)/(1+Math.pow(r/0.20,2));
        a*=Math.min(1, Math.pow(along/0.05,0.8));            // soft mouth: no blob at the lens
      }
    }
    a*=r>=1?0:Math.pow(Math.cos(r*Math.PI/2),1.2);           // fades to a true zero
    a*=Math.pow(Math.sin(Math.PI*(x+0.5)/W),0.9);            // never a hard side edge
    var i=(y*W+x)*4; img.data[i]=rgb[0]; img.data[i+1]=rgb[1]; img.data[i+2]=rgb[2];
    img.data[i+3]=Math.max(0,Math.min(255,a*255));
  }
  g.putImageData(img,0,0);
  var t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding;
  _plTex[key]=t; return t;
}
var _plDot=null;
function plDiffuserTex(){
  if(_plDot) return _plDot;
  _plDot=canvasTex(32,32,function(x,w,h){
    var g=x.createRadialGradient(16,16,0,16,16,16);
    g.addColorStop(0,'rgba(255,214,160,0.9)'); g.addColorStop(0.35,'rgba(255,190,130,0.25)'); g.addColorStop(1,'rgba(255,180,110,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
  },true);
  return _plDot;
}
var _plShadow=null;
function plShadowMat(){
  if(_plShadow) return _plShadow;
  var t=canvasTex(64,96,function(x,w,h){
    x.setTransform(1,0,0,1.5,0,-16);
    var g=x.createRadialGradient(32,40,3,32,40,30);
    g.addColorStop(0,'rgba(0,0,0,0.32)'); g.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h*2);
  },false);
  _plShadow=new THREE.MeshBasicMaterial({map:t, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2});
  return _plShadow;
}
function sidingLum(){
  var c=(typeof sc!=='undefined')?sc:0x808080;
  return (0.2126*((c>>16)&255)+0.7152*((c>>8)&255)+0.0722*(c&255))/255;
}
function plStyleOf(g){
  var d=(typeof porchLightsData!=='undefined' && porchLightsData[g.userData.index])||{};
  return d.beam==='updown' ? 'updown' : (d.style||'modern');
}
function dressLights(mode){
  if(typeof porchLightMeshes==='undefined' || !porchLightMeshes) return;
  var lit=(mode!=='day'), nReal=0, lum=sidingLum();
  /* Additive light on pale paint saturates to white; on black it vanishes.
     Scale by the paint's luminance so all three read as the same lamp. */
  var washK=(mode==='night'?1.0:0.78)*(0.62-0.40*lum);
  porchLightMeshes.forEach(function(pm){
    var g=pm.group; if(!g || g.userData.drLit) return; g.userData.drLit=true;
    var fx=null; g.children.forEach(function(ch){ if(!fx && ch.isGroup) fx=ch; });
    if(!fx) return;
    var style=plStyleOf(g), P=plProfile(style);
    var y=fx.position.y, fz=fx.position.z;
    var bb=(typeof SIDING!=='undefined' && SIDING==='board-batten') && !g.userData.faceN;
    var faceZ=(g.userData.faceN?0:0.025)+(bb?0.0125:0)+0.002;
    var dims=(typeof plFixtureDims==='function')?plFixtureDims(style==='updown'?'modern':style):{hw:0.04,hh:0.06,back:0.03};
    // ceiling the wash may reach: wall top, or the porch ceiling it hangs under
    var top=(g.userData.wall && typeof plWallTop==='function')?plWallTop(g.userData.wall):y+0.6;
    var roomUp=Math.max(0.02, top-0.03-y), roomDown=Math.max(0.05, y-0.02);
    // contact shadow for the styles that did not bring their own
    if(style==='craftsman' || style==='classic'){
      var sh=new THREE.Mesh(new THREE.PlaneGeometry(dims.hw*3.2, dims.hh*3.4), plShadowMat());
      sh.position.set(0, y-0.015, faceZ-0.001); sh.raycast=function(){}; g.add(sh);
    }
    // diffuser + glow ring: lamp on at dusk/night, plain glass by day
    fx.traverse(function(o){
      if(o.isMesh && o.material && o.material.emissive && o.material.emissive.getHex()!==0 && o.material.emissiveIntensity>0.3){
        o.material=o.material.clone();
        o.material.emissive.setRGB(plWarmRGB()[0]/255, plWarmRGB()[1]/255, plWarmRGB()[2]/255);
        o.material.emissiveIntensity=lit?(style==='modern'||style==='updown'?1.1:0.75):0.02;
        if(!lit) o.material.color.setHex(style==='classic'?0xf3efe6:0xd8d2c4);
      }
    });
    if(style==='updown'){
      // top lens on the same cylinder
      var lens=fx.children.find(function(o){ return o.isMesh && o.position.y<-0.07; });
      if(lens){ var top2=lens.clone(); top2.position.y=-lens.position.y; fx.add(top2); }
    }
    var reals=[]; fx.traverse(function(o){ if(o.isPointLight) reals.push(o); });
    reals.forEach(function(o){
      if(!lit || nReal>=PL_REAL_MAX){ o.intensity=0; o.visible=false; return; }
      nReal++; o.color.setRGB(plWarmRGB()[0]/255, plWarmRGB()[1]/255, plWarmRGB()[2]/255);
      o.intensity=P.real.i*(mode==='night'?1.1:0.9); o.distance=P.real.d; o.decay=2; o.castShadow=false;
      o.position.set(0, P.real.y, P.real.z);
    });
    if(!lit) return;
    P.beams.forEach(function(beam){
      var wdt, hgt, cy;
      if(beam.dir===0){
        var rad=beam.reach;
        hgt=Math.min(rad*1.6, rad*0.67+roomUp+rad*0.9); wdt=rad*1.2;
        var up=Math.min(roomUp, hgt*0.42);           // clip at the ceiling, never onto the roof
        hgt=up+hgt*0.58; cy=y+up-hgt/2;
      } else if(beam.dir<0){
        hgt=Math.min(beam.reach*1.9, roomDown+0.08); wdt=Math.min(1.1, beam.reach*1.15);
        cy=y+P.diffY+0.01-hgt/2;
      } else {
        hgt=Math.min(beam.reach*1.6, roomUp); wdt=Math.min(0.9, beam.reach*0.95);
        cy=y-P.diffY-0.01+hgt/2;
      }
      if(hgt<0.04) return;
      var m=new THREE.Mesh(new THREE.PlaneGeometry(wdt,hgt),
        new THREE.MeshBasicMaterial({map:plWashTex(beam), transparent:true, opacity:washK*(beam.dir===1?0.8:1),
          blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, fog:false}));
      m.position.set(0, cy, faceZ); m.renderOrder=2; m.raycast=function(){};
      g.add(m);
    });
    // tiny lens bloom - the size of the diffuser, not a halo around the fixture
    var dot=new THREE.Sprite(new THREE.SpriteMaterial({map:plDiffuserTex(), transparent:true, opacity:mode==='night'?0.55:0.4,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, fog:false}));
    var s=P.diffR*2.6; dot.scale.set(s,s,s); dot.position.set(0, y+P.diffY-0.004, fz+0.01); dot.raycast=function(){};
    g.add(dot);
    if(style==='updown'){ var d2=dot.clone(); d2.position.y=y-P.diffY+0.004; g.add(d2); }
  });
}
/* Time of day: electrical on = dusk (unchanged default). ?tod=day|dusk|night
   or DR.setMode() forces one for previews and tests. */
var _todQ=/[?&]tod=(day|dusk|night)\b/.exec(location.search);
DR.forceMode=_todQ?_todQ[1]:null;
DR.setMode=function(m){ DR.forceMode=m||null; if(typeof applyLighting==='function') applyLighting(); if(typeof buildShed==='function') buildShed(); };
function curMode(){
  if(DR.forceMode) return DR.forceMode;
  return (typeof ELEC!=='undefined' && ELEC!=='none')?'dusk':'day';
}
function afterBuild(){
  if(!st.ready) return;
  var night=curMode()!=='day';
  if(typeof floatLogos!=='undefined' && floatLogos) floatLogos.forEach(function(m){ m.visible=false; });
  if(typeof shedGroup!=='undefined' && shedGroup){
    shedGroup.traverse(function(o){
      if(!o.isMesh) return;
      dressPad(o);
      dressBatten(o);
      if(isGlass(o.material) && !o.material.userData.drGlow){
        o.material.userData.drGlow=true;
        if(night){ o.material.color.setHex(0xffc47e); o.material.opacity=0.58; }
        else { o.material.color.setHex(0xcfdce6); o.material.opacity=0.22; }  // reads as glass, not a hole
      }
    });
  }
  dressLights(curMode());
  markActive();
}

/* ── lighting ── */
function applyMode(){
  if(!st.ready) return;
  var tod=curMode(), night=tod!=='day';
  var mode=night?'dusk':'day';
  if(typeof mountainGroup!=='undefined' && mountainGroup) mountainGroup.visible=false;
  if(!st.skyTex[mode]) st.skyTex[mode]=gradientTex(SKY[mode]);
  if(skyDome){ skyDome.material.map=st.skyTex[mode]; skyDome.material.needsUpdate=true; }
  if(scene.fog){ scene.fog.color.setHex(FOG[mode].c); scene.fog.near=FOG[mode].near; scene.fog.far=FOG[mode].far; }
  renderer.setClearColor(FOG[mode].c);
  if(!st.envTex[mode]) st.envTex[mode]=buildEnv(ENVGRAD[mode]);
  if(st.envTex[mode]) scene.environment=st.envTex[mode];
  if(night){
    /* 0.88, was 1.05: the day exposure came down by the same factor (0.80/0.95)
       when the colour fix landed - see DAY_RIG in designer.html. Both were
       tuned against the same two colour errors, so both move together. */
    renderer.toneMappingExposure=0.88;
    ambLight.intensity=0.06;
    hemiLight.intensity=0.80; hemiLight.color.setHex(0x8ea2d0); hemiLight.groundColor.setHex(0x1f251b);
    sunLight.intensity=0.65; sunLight.color.setHex(0xffb98f);         // last warm light from the west
    sunLight.position.set(-9,4.2,8);
    fillLight.intensity=0.22; fillLight.color.setHex(0x7088c4);
    rimLight.intensity=0.35; rimLight.color.setHex(0xffb37a);
    if(tod==='night'){
      // full dark: the fixtures carry the wall
      renderer.toneMappingExposure=0.82;
      hemiLight.intensity=0.32; hemiLight.color.setHex(0x55658f);
      sunLight.intensity=0.12; sunLight.color.setHex(0x8090c0);
      fillLight.intensity=0.10; rimLight.intensity=0.08;
    }
  } else {
    renderer.toneMappingExposure=(typeof DAY_RIG!=='undefined'?DAY_RIG.exposure:0.9)+0.05;
    hemiLight.color.setHex(0xc9dcf2); hemiLight.groundColor.setHex(0x4c5a38);
  }
  if(st.ring){
    ringTexture(mode, function(t){
      if((curMode()!=='day'?'dusk':'day')!==mode) return;   // mode changed while loading
      st.ring.material.map=t; st.ring.material.color.setHex(night?0xe6e6ee:0xf2f2f2);
      st.ring.material.needsUpdate=true; st.ring.visible=true; markActive();
      // warm the other one up once the first is on screen
      setTimeout(function(){ ringTexture(night?'day':'dusk', function(){}); }, 4000);
    });
  }
  if(st.lawnMat) st.lawnMat.color.setHex(night?0x93a08c:0xc4cdb9);
  st.mode=mode;
  markActive();
}

/* ── tier: resolution, shadows, idle frame skipping ── */
function applyTier(){
  var dpr=window.devicePixelRatio||1;
  renderer.setPixelRatio(Math.min(dpr, LOW?1.5:2));
  if(typeof sunLight!=='undefined' && sunLight){
    var size=LOW?1024:2048;
    sunLight.shadow.mapSize.set(size,size);
    sunLight.shadow.radius=LOW?3:5;
    if(sunLight.shadow.map){ sunLight.shadow.map.dispose(); sunLight.shadow.map=null; }
  }
  renderer.shadowMap.type=LOW?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;
  renderer.shadowMap.needsUpdate=true;
  var vp=document.querySelector('.vp'); if(vp) renderer.setSize(vp.clientWidth, vp.clientHeight);
  if(LOW){
    /* Idle frame skipping: once nothing has moved for a moment, draw at ~4fps
       instead of 60. Any input, rebuild, relight or camera move goes straight
       back to full rate. Captures always render (they move the camera). */
    var real=renderer.render.bind(renderer), last=0;
    renderer.render=function(s,c){
      var now=performance.now();
      var key=c ? c.matrixWorld.elements.join(',')+c.projectionMatrix.elements[0] : '';
      if(key!==st.camKey){ st.camKey=key; st.lastActive=now; }
      if(now-st.lastActive>1500 && now-last<250) return;
      last=now; real(s,c);
    };
    ['pointerdown','pointermove','wheel','keydown','touchstart','touchmove'].forEach(function(ev){
      window.addEventListener(ev, markActive, {passive:true, capture:true});
    });
  }
}

/* ── hooks ── */
function wrap(name, after){
  var orig=window[name]; if(typeof orig!=='function' || orig._dr) return;
  var f=function(){ var r=orig.apply(this, arguments); try{ after(); }catch(e){ console.error('realism '+name, e); } return r; };
  f._dr=true; window[name]=f;
}
function setup(){
  if(st.ready) return;
  try{
    applyTier();
    setupGround();
    setupRing();
    st.ready=true;
    wrap('applyLighting', applyMode);
    wrap('buildShed', afterBuild);
    if(typeof applyLighting==='function') applyLighting();   // relight through the wrapper
    if(typeof buildShed==='function') buildShed();
    window.addEventListener('resize', markActive);
  }catch(e){ console.error('realism setup failed', e); }
}
/* init() runs whenever three.js finishes downloading, which can be before or
   after this file, so wait for its scene rather than hooking init itself. */
(function wait(){
  if(window.THREE && window.renderer && window.scene && window.shedGroup && window.sunLight) return setup();
  setTimeout(wait, 60);
})();

/* ── a clean 3:2 picture for the AI artist's rendering ── */
DR.captureForAI = function(){
  var R=renderer, cam=camera;
  var sp=phi, stt=theta, sr=radius, pr=R.getPixelRatio(), size=new THREE.Vector2(); R.getSize(size);
  var aspect=cam.aspect, sel=(typeof selectedWindow!=='undefined')?selectedWindow:null;
  var url=null;
  try{
    R.setPixelRatio(1); R.setSize(1536,1024,false);
    cam.aspect=1.5; cam.updateProjectionMatrix();
    phi=1.22; theta=0.62; radius=(typeof fitRadius==='function'?fitRadius():radius)*1.12; updateCamera();
    R.render(scene,cam);
    url=R.domElement.toDataURL('image/jpeg',0.9);
  }catch(e){ console.error('capture failed', e); }
  R.setPixelRatio(pr); R.setSize(size.x,size.y,false);
  cam.aspect=aspect; cam.updateProjectionMatrix();
  phi=sp; theta=stt; radius=sr; updateCamera(); R.render(scene,cam);
  markActive();
  return url;
};
})();
