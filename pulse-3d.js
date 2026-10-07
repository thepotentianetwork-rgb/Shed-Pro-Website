/* pulse-3d.js — a soft "attention" pulse on everything that opens the 3D
   designer (/designer): nav "Design in 3D", hero/studio/band/final CTAs,
   footer and mobile-menu buttons, gallery "Design this style in 3D", and the
   inline "Design your shed in 3D" links in articles.
   Buttons get a glowing brand-blue ring that breathes out with a 3% lift
   every 2.8s; inline text links get a gentle text glow instead (a ring around
   a word in a sentence looks like a bug). Nothing moves with
   prefers-reduced-motion. Not loaded on /designer itself.
   Opt an element out with data-no-pulse. */
(function(){
'use strict';
if(/^\/designer/.test(location.pathname)) return;
var CSS=''+
'@keyframes sp3dRing{0%{opacity:0;box-shadow:0 0 0 0 rgba(43,181,232,.55)}'+
  '10%{opacity:1;box-shadow:0 0 0 0 rgba(43,181,232,.55),0 0 14px 2px rgba(43,181,232,.28)}'+
  '42%{opacity:0;box-shadow:0 0 0 9px rgba(43,181,232,0),0 0 22px 6px rgba(43,181,232,0)}'+
  '100%{opacity:0;box-shadow:0 0 0 9px rgba(43,181,232,0)}}'+
'@keyframes sp3dLift{0%,46%,100%{scale:1}18%{scale:1.03}}'+
'@keyframes sp3dGlow{0%,50%,100%{text-shadow:none}20%{text-shadow:0 0 10px rgba(43,181,232,.75),0 0 2px rgba(43,181,232,.5)}}'+
'.sp3d-pulse{animation:sp3dLift 2.8s cubic-bezier(.4,0,.2,1) 1.2s infinite}'+
'.sp3d-pulse::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;'+
  'animation:sp3dRing 2.8s cubic-bezier(.4,0,.2,1) 1.2s infinite}'+
'.sp3d-pulse:hover,.sp3d-pulse:focus-visible,.sp3d-pulse:hover::after,.sp3d-pulse:focus-visible::after{animation-play-state:paused}'+
'.sp3d-glow{animation:sp3dGlow 2.8s ease-in-out 1.2s infinite}'+
'@media (prefers-reduced-motion:reduce){.sp3d-pulse,.sp3d-pulse::after,.sp3d-glow{animation:none!important}}';
function init(){
  if(!document.getElementById('sp3d-style')){
    var st=document.createElement('style'); st.id='sp3d-style'; st.textContent=CSS; document.head.appendChild(st);
  }
  var links=document.querySelectorAll('a[href="/designer"], a[href^="/designer?"], a[href^="/designer#"], a[href="https://www.shedpro-utah.com/designer"]');
  Array.prototype.forEach.call(links, function(a){
    if(a.hasAttribute('data-no-pulse') || a.classList.contains('device-link')) return;   // invisible overlay on the preview image
    var cs=getComputedStyle(a);
    var inline=(cs.display==='inline') && !a.classList.contains('btn');
    if(inline){ a.classList.add('sp3d-glow'); return; }
    if(cs.position==='static') a.style.position='relative';
    a.classList.add('sp3d-pulse');
  });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
