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
function setupRing(){
  var R=36, COPIES=6, H=(2*Math.PI*R/COPIES)*(1024/1536), Y0=-3.2;
  var geo=new THREE.CylinderGeometry(R,R,H,96,1,true);
  var mat=new THREE.MeshBasicMaterial({side:THREE.BackSide, transparent:true, depthWrite:false, fog:false, toneMapped:false, color:0xffffff});
  var ring=new THREE.Mesh(geo, mat);
  ring.position.y=Y0+H/2; ring.rotation.y=0.2; ring.renderOrder=-1;
  ring.visible=false;
  scene.add(ring); st.ring=ring;
}
function ringTexture(mode, cb){
  if(st.ringTex[mode]) return cb(st.ringTex[mode]);
  loadTex(ENV+'backdrop-'+mode+(LOW?'-1k':'')+'.webp', true, function(t){
    t.encoding=THREE.sRGBEncoding; t.wrapS=THREE.MirroredRepeatWrapping; t.repeat.set(6,1);
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
var mapAvgCache=typeof WeakMap!=='undefined'?new WeakMap():null;
function mapAvg(img){
  if(!img || !mapAvgCache) return 1;
  if(mapAvgCache.has(img)) return mapAvgCache.get(img);
  if(img.complete===false || !(img.width>0)) return 1;
  var v=1;
  try{
    var c=document.createElement('canvas'); c.width=c.height=32;
    var x=c.getContext('2d'); x.drawImage(img,0,0,32,32);
    var d=x.getImageData(0,0,32,32).data, t=0;
    for(var i=0;i<d.length;i+=4){ var l=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255; t+=Math.pow(l,2.2); }
    v=Math.max(0.2,Math.min(1,t/(d.length/4)));
  }catch(e){}
  mapAvgCache.set(img,v); return v;
}
function findWallMap(){
  var img=null;
  shedGroup.traverse(function(o){
    if(img || !o.isMesh || !o.material || !o.material.map || !o.material.isMeshStandardMaterial) return;
    var g=o.geometry && o.geometry.parameters;
    if(g && g.width>1 && o.material.color.getHex()===sc) img=o.material.map.image;
  });
  return img;
}
function dressBatten(m, wallMul){
  if(typeof SIDING==='undefined' || SIDING!=='board-batten') return;
  var mt=m.material; if(!mt || !mt.isMeshStandardMaterial || mt.map || mt.userData.drBat) return;
  if(Math.abs(mt.roughness-0.62)>0.005 || mt.color.getHex()!==sc) return;
  mt.userData.drBat=true;
  /* The walls are the same paint colour multiplied by a siding texture, so they
     render darker than the untextured battens; on dark paint that read as pale
     pinstripes. Match the battens to the wall's effective (linear) tone. */
  if(wallMul && wallMul<1) mt.color.multiplyScalar(Math.min(1,wallMul*1.12));
  mt.roughness=0.8; mt.envMapIntensity=0.6; mt.needsUpdate=true;
}

/* ── warm glow ── */
function isGlass(mat){
  if(!mat || !mat.isMeshBasicMaterial || !mat.transparent) return false;
  var h=mat.color.getHex();
  return (h===0xffe9c4 && Math.abs(mat.opacity-0.10)<1e-3) || (h===0xdfeaf0 && Math.abs(mat.opacity-0.045)<1e-3);
}
var washTex=null;
function getWashTex(){
  if(washTex) return washTex;
  washTex=canvasTex(128,256,function(x,w,h){
    var g=x.createRadialGradient(w/2,18,2,w/2,18,h*0.95);
    g.addColorStop(0,'rgba(255,214,150,0.95)'); g.addColorStop(0.18,'rgba(255,190,120,0.55)');
    g.addColorStop(0.55,'rgba(255,170,100,0.16)'); g.addColorStop(1,'rgba(255,160,90,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
    x.globalCompositeOperation='destination-in';           // a soft downward cone
    var m=x.createLinearGradient(0,0,w,0);
    m.addColorStop(0,'rgba(0,0,0,0)'); m.addColorStop(0.5,'rgba(0,0,0,1)'); m.addColorStop(1,'rgba(0,0,0,0)');
    x.fillStyle=m; x.beginPath(); x.moveTo(w*0.36,0); x.lineTo(w*0.64,0); x.lineTo(w,h); x.lineTo(0,h); x.closePath(); x.fill();
  },true);
  return washTex;
}
var haloTex=null;
function getHaloTex(){
  if(haloTex) return haloTex;
  haloTex=canvasTex(64,64,function(x,w,h){
    var g=x.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,230,180,1)'); g.addColorStop(0.25,'rgba(255,200,130,0.5)'); g.addColorStop(1,'rgba(255,180,110,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
  },true);
  return haloTex;
}
function dressLights(night){
  if(typeof porchLightMeshes==='undefined' || !porchLightMeshes) return;
  porchLightMeshes.forEach(function(pm){
    var g=pm.group; if(!g || g.userData.drLit) return; g.userData.drLit=true;
    if(!night) return;
    var fx=null; g.children.forEach(function(ch){ if(!fx && ch.isGroup) fx=ch; });
    if(!fx) return;
    var y=fx.position.y;
    var wash=new THREE.Mesh(new THREE.PlaneGeometry(0.62,0.95),
      new THREE.MeshBasicMaterial({map:getWashTex(), transparent:true, opacity:0.55, blending:THREE.AdditiveBlending,
        depthWrite:false, toneMapped:false, fog:false}));
    wash.position.set(0, y-0.40, 0.012); wash.renderOrder=2; wash.raycast=function(){};
    g.add(wash);
    var halo=new THREE.Sprite(new THREE.SpriteMaterial({map:getHaloTex(), transparent:true, opacity:0.9,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false, fog:false}));
    halo.scale.set(0.16,0.16,0.16); halo.position.set(0, y-0.07, 0.07); halo.raycast=function(){};
    g.add(halo);
    fx.traverse(function(o){ if(o.isPointLight){ o.intensity=0.9; o.distance=1.7; o.decay=2; } });
  });
}
function afterBuild(){
  if(!st.ready) return;
  var night=(typeof ELEC!=='undefined' && ELEC!=='none');
  if(typeof floatLogos!=='undefined' && floatLogos) floatLogos.forEach(function(m){ m.visible=false; });
  if(typeof shedGroup!=='undefined' && shedGroup){
    var wallMul=(typeof SIDING!=='undefined' && SIDING==='board-batten')?mapAvg(findWallMap()):1;
    shedGroup.traverse(function(o){
      if(!o.isMesh) return;
      dressPad(o);
      dressBatten(o, wallMul);
      if(isGlass(o.material) && !o.material.userData.drGlow){
        o.material.userData.drGlow=true;
        if(night){ o.material.color.setHex(0xffc47e); o.material.opacity=0.58; }
        else { o.material.color.setHex(0xcfdce6); o.material.opacity=0.22; }  // reads as glass, not a hole
      }
    });
  }
  dressLights(night);
  markActive();
}

/* ── lighting ── */
function applyMode(){
  if(!st.ready) return;
  var night=(typeof ELEC!=='undefined' && ELEC!=='none');
  var mode=night?'dusk':'day';
  if(typeof mountainGroup!=='undefined' && mountainGroup) mountainGroup.visible=false;
  if(!st.skyTex[mode]) st.skyTex[mode]=gradientTex(SKY[mode]);
  if(skyDome){ skyDome.material.map=st.skyTex[mode]; skyDome.material.needsUpdate=true; }
  if(scene.fog){ scene.fog.color.setHex(FOG[mode].c); scene.fog.near=FOG[mode].near; scene.fog.far=FOG[mode].far; }
  renderer.setClearColor(FOG[mode].c);
  if(!st.envTex[mode]) st.envTex[mode]=buildEnv(ENVGRAD[mode]);
  if(st.envTex[mode]) scene.environment=st.envTex[mode];
  if(night){
    renderer.toneMappingExposure=1.05;
    ambLight.intensity=0.06;
    hemiLight.intensity=0.80; hemiLight.color.setHex(0x8ea2d0); hemiLight.groundColor.setHex(0x1f251b);
    sunLight.intensity=0.65; sunLight.color.setHex(0xffb98f);         // last warm light from the west
    sunLight.position.set(-9,4.2,8);
    fillLight.intensity=0.22; fillLight.color.setHex(0x7088c4);
    rimLight.intensity=0.35; rimLight.color.setHex(0xffb37a);
  } else {
    renderer.toneMappingExposure=(typeof DAY_RIG!=='undefined'?DAY_RIG.exposure:0.9)+0.05;
    hemiLight.color.setHex(0xc9dcf2); hemiLight.groundColor.setHex(0x4c5a38);
  }
  if(st.ring){
    ringTexture(mode, function(t){
      if(((typeof ELEC!=='undefined' && ELEC!=='none')?'dusk':'day')!==mode) return;   // mode changed while loading
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
