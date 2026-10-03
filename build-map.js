/* Shared ShedPro build map (home, FAQ). One source of truth for the style and the city list.
   Markup: <div class="bmap" data-build-map> <div class="bmap-canvas"></div> ...overlays... </div>
   Leaflet loads only when a map nears the viewport. Touch devices must tap to interact (no scroll trap). */
(function(){
  /* One entry per city, de-duplicated from the original build list (first coordinate kept, no new locations). */
  var CITIES = [
    ["Millcreek, UT", 40.6927, -111.8252],
    ["Provo Canyon / Rock Canyon, UT", 40.2733, -111.6178],
    ["North Logan, UT", 41.7672, -111.7958],
    ["Brigham City, UT", 41.5102, -112.0155],
    ["Perry, UT", 41.4669, -112.0469],
    ["Logan, UT", 41.737, -111.8338],
    ["Farmington, UT", 40.9805, -111.8874],
    ["Hyrum, UT", 41.6325, -111.8505],
    ["Layton, UT", 41.078, -111.9555],
    ["Mapleton, UT", 40.1429, -111.5772],
    ["North Ogden / Pleasant View, UT", 41.3088, -111.9669],
    ["Eagle Mountain, UT", 40.3147, -112.0006],
    ["Preston, ID", 42.0966, -111.8766],
    ["Soda Springs, ID", 42.653, -111.6041],
    ["Kaysville, UT", 41.035, -111.9391],
    ["Malad City, ID", 42.1916, -112.2502],
    ["Twin Falls, ID", 42.563, -114.4609],
    ["Pocatello, ID", 42.8713, -112.4455],
    ["Idaho Falls, ID", 43.4666, -112.0341],
    ["Heber City, UT", 40.5069, -111.4133],
    ["Park City, UT", 40.6461, -111.498],
    ["Morgan, UT", 41.0391, -111.6766],
    ["Smithfield, UT", 41.8347, -111.8336],
    ["Provo, UT", 40.25, -111.665],
    ["Ogden, UT", 41.223, -111.9738],
    ["Bountiful, UT", 40.8894, -111.8808],
    ["Salt Lake City, UT", 40.7608, -111.891],
    ["Sandy, UT", 40.5649, -111.8389],
    ["Lehi, UT", 40.3916, -111.8508],
    ["American Fork, UT", 40.3766, -111.7958],
    ["Orem, UT", 40.2969, -111.6946],
    ["Spanish Fork, UT", 40.115, -111.6549],
    ["Tremonton, UT", 41.7116, -112.1652]
  ];
  var maps = [].slice.call(document.querySelectorAll('[data-build-map]'));
  if(!maps.length) return;
  var LEAFLET_CSS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
      LEAFLET_JS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
      loading=null;
  function loadLeaflet(){
    if(window.L) return Promise.resolve();
    if(loading) return loading;
    loading=new Promise(function(res,rej){
      if(!document.querySelector('link[href="'+LEAFLET_CSS+'"]')){var c=document.createElement('link');c.rel='stylesheet';c.href=LEAFLET_CSS;document.head.appendChild(c);}
      var s=document.createElement('script');s.src=LEAFLET_JS;s.onload=res;s.onerror=rej;document.head.appendChild(s);
    });
    return loading;
  }
  function init(wrap){
    var el=wrap.querySelector('.bmap-canvas'); if(!el||el._bmap) return;
    var touch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
    var map=L.map(el,{scrollWheelZoom:false,dragging:!touch,touchZoom:!touch,doubleClickZoom:!touch,boxZoom:false,keyboard:true,zoomControl:false,zoomSnap:.25,tap:false});
    el._bmap=map;
    L.control.zoom({position:'topright'}).addTo(map);
    map.createPane('glow');map.getPane('glow').style.zIndex=350;map.getPane('glow').style.mixBlendMode='screen';
    map.createPane('labels');map.getPane('labels').style.zIndex=380;map.getPane('labels').style.pointerEvents='none';
    /* Esri dark gray canvas: free, no API key */
    var esri='https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(esri+'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,attribution:'&copy; Esri &mdash; Esri, DeLorme, NAVTEQ'}).addTo(map);
    L.tileLayer(esri+'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',{maxZoom:16,pane:'labels',opacity:.8}).addTo(map);
    var glow=L.divIcon({className:'bmap-glow',html:'<div></div>',iconSize:[96,96],iconAnchor:[48,48]});
    CITIES.forEach(function(c){L.marker([c[1],c[2]],{icon:glow,pane:'glow',interactive:false,keyboard:false}).addTo(map)});
    CITIES.forEach(function(c,i){
      var pin=L.divIcon({className:'bmap-pin',html:'<div style="--dl:'+((i*0.37)%2.8).toFixed(2)+'s"></div>',iconSize:[12,12],iconAnchor:[6,6]});
      L.marker([c[1],c[2]],{icon:pin,title:c[0],riseOnHover:true}).addTo(map).bindPopup('<div class="build-popup-title">'+c[0]+'</div>',{closeButton:false,offset:[0,-4]});
    });
    var vg=wrap.querySelector('.bmap-vignette'); if(vg) map.getContainer().appendChild(vg);
    map.fitBounds(L.latLngBounds(CITIES.map(function(c){return [c[1],c[2]]})),{padding:[40,40]});
    wrap.classList.add('ready');
    var gate=wrap.querySelector('.bmap-gate'),done=wrap.querySelector('.bmap-done');
    if(touch){
      wrap.classList.add('touch');
      var on=function(v){wrap.classList.toggle('live',v);['dragging','touchZoom','doubleClickZoom'].forEach(function(h){map[h][v?'enable':'disable']()})};
      if(gate) gate.addEventListener('click',function(){on(true)});
      if(done) done.addEventListener('click',function(){on(false)});
      if('IntersectionObserver' in window) new IntersectionObserver(function(es){if(!es[0].isIntersecting)on(false)}).observe(wrap);
    } else {
      map.on('click focus',function(){map.scrollWheelZoom.enable()});
      map.getContainer().addEventListener('mouseleave',function(){map.scrollWheelZoom.disable()});
    }
  }
  function start(wrap){ loadLeaflet().then(function(){init(wrap)}).catch(function(){wrap.classList.add('failed')}); }
  maps.forEach(function(wrap){
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){if(es[0].isIntersecting){io.disconnect();start(wrap)}},{rootMargin:'600px 0px'});
      io.observe(wrap);
    } else start(wrap);
  });
})();
