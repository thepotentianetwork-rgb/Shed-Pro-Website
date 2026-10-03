/* lead-source.js: remembers where a visitor came from (first and last touch)
   so the designer can attach it to a quote request. Self-contained and safe on
   any page; it stores only marketing parameters, the external referrer and the
   landing path, in this browser's localStorage. Read with SPLeadSource.get(). */
(function(){
  var KEY='sp_lead_source_v1', KEYS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid'];
  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}')||{}; }catch(e){ return {}; } }
  function write(v){ try{ localStorage.setItem(KEY, JSON.stringify(v)); }catch(e){} }
  try{
    var q=new URLSearchParams(location.search), t={}, hasParam=false;
    KEYS.forEach(function(k){ var v=q.get(k); if(v){ t[k]=String(v).slice(0,120); hasParam=true; } });
    var ref='';
    try{ if(document.referrer){ var r=new URL(document.referrer); if(r.hostname!==location.hostname) ref=r.hostname; } }catch(e){}
    if(ref) t.ref=ref;
    t.land=location.pathname; t.ts=new Date().toISOString();
    var s=read();
    if(!s.first){ s.first=t; if(!hasParam && !ref) s.first.direct=true; }
    if(hasParam || ref) s.last=t;
    write(s);
  }catch(e){}
  window.SPLeadSource={ get:function(){ var s=read(); return (s.first||s.last) ? {first:s.first||null, last:s.last||null} : null; } };
})();
