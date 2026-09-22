import io, sys, json
import os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SRC = sys.argv[1] if len(sys.argv)>1 else os.path.join(REPO, 'designer.html')
s = io.open(SRC, encoding='utf-8').read()
s = s.replace("scr.src='https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'","scr.src='three.min.js'")
s = s.replace("s2.src='https://unpkg.com/three@0.128.0/build/three.min.js'","s2.src='three.min.js'")
# Capture scaffolding. LOCAL ONLY — never committed. Reads ?cap=<json>, applies a
# build + a fixed camera, hides the UI so the canvas fills the frame.
HARNESS = """
<script>
(function(){
  function qp(){ try{ var m=/[?&]cap=([^&]+)/.exec(location.search); return m?JSON.parse(decodeURIComponent(m[1])):null; }catch(e){ return null; } }
  var cap=qp(); if(!cap) return;
  function ready(){ return typeof buildShed==='function' && typeof updateCamera==='function' && typeof shedGroup!=='undefined' && shedGroup; }
  var tries=0;
  var iv=setInterval(function(){
    tries++;
    if(!ready()){ if(tries>400){clearInterval(iv);} return; }
    clearInterval(iv);
    try{
      // hide every chrome element so only the 3D is in frame
      ['.sb','header','.ticker','#subPage','.wprog','#editBadge','#dupBtn','#wallPick','#consultNudge','.hint','#toast'].forEach(function(sel){
        document.querySelectorAll(sel).forEach(function(e){ e.style.display='none'; });
      });
      var vp=document.getElementById('vp')||document.querySelector('canvas').parentNode;
      if(vp){ vp.style.position='fixed'; vp.style.left='0'; vp.style.top='0'; vp.style.width='100vw'; vp.style.height='100vh'; }
      Object.keys(cap.set||{}).forEach(function(k){ window[k]=cap.set[k]; });
      if(cap.style && typeof pickStyle==='function'){ try{ pickStyle(cap.style,null); }catch(e){} }
      Object.keys(cap.set||{}).forEach(function(k){ window[k]=cap.set[k]; });
      buildShed();
      if(typeof renderPlacedDoors==='function') renderPlacedDoors();
      theta=cap.theta!=null?cap.theta:0.85; phi=cap.phi!=null?cap.phi:1.12; radius=cap.radius!=null?cap.radius:9.0;
      if(typeof userZoomed!=='undefined') userZoomed=true;
      if(typeof renderer!=='undefined' && renderer && renderer.setSize){
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
      }
      updateCamera();
      document.title='CAP-READY';
    }catch(e){ document.title='CAP-ERR '+e.message; }
  }, 50);
})();
</script>
"""
s = s.replace('</body>', HARNESS + '</body>')
io.open('/tmp/claude-0/shot/designer.html','w',encoding='utf-8').write(s)
print('built capture page from', SRC)
