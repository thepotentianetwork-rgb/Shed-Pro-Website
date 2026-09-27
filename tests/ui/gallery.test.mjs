// Drives the real gallery.html in a real browser: the filter row, the lightbox,
// and the page fade-in. Reports results back over HTTP because off-thread work
// never settles under --virtual-time-budget with --dump-dom.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PORT = 8749;
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.json':'application/json', '.ico':'image/x-icon' };

const HARNESS = `<!DOCTYPE html><meta charset="utf-8"><title>gallery harness</title>
<style>html,body{margin:0}iframe{width:1200px;height:900px;border:0}</style>
<iframe id="f" src="/gallery.html"></iframe>
<script>
var out = [];
function t(name, pass, detail){ out.push({name:name, pass:!!pass, detail:detail||''}); }
function done(){
  navigator.sendBeacon('/report', JSON.stringify(out));
  fetch('/report', {method:'POST', body: JSON.stringify(out)});
}
document.getElementById('f').onload = function(){
  var w = this.contentWindow, d = this.contentDocument;
  try {
    // --- the three functions actually exist ---
    t('filterGallery is defined', typeof w.filterGallery === 'function', typeof w.filterGallery);
    t('openLightbox is defined',  typeof w.openLightbox  === 'function', typeof w.openLightbox);
    t('closeLightbox is defined', typeof w.closeLightbox === 'function', typeof w.closeLightbox);

    var items = d.querySelectorAll('.gallery-item[data-style]');
    var btns  = d.querySelectorAll('.filter-btn');
    t('the gallery has filterable items', items.length >= 8, items.length + ' items');

    function visible(){
      var n = 0;
      for (var i=0;i<items.length;i++) if (!items[i].classList.contains('hidden')) n++;
      return n;
    }

    // --- filtering by style hides the rest, and only the rest ---
    var barnBtn = null, gableBtn = null, allBtn = null;
    for (var b=0;b<btns.length;b++){
      var a = btns[b].getAttribute('onclick')||'';
      if (a.indexOf("'barn'")  > -1) barnBtn = btns[b];
      if (a.indexOf("'gable'") > -1) gableBtn = btns[b];
      if (a.indexOf("'all'")   > -1) allBtn = btns[b];
    }
    barnBtn.click();
    var barnShown = visible(), barnExpected = 0;
    for (var i=0;i<items.length;i++)
      if ((' '+items[i].getAttribute('data-style')+' ').indexOf(' barn ') > -1) barnExpected++;
    t('Barn shows only barn builds', barnShown === barnExpected && barnShown > 0,
      barnShown + ' shown, ' + barnExpected + ' are barns');
    t('Barn button becomes the active one',
      barnBtn.classList.contains('active') && !allBtn.classList.contains('active'));

    // a multi-tag item ("gable garden") must appear under gable too
    gableBtn.click();
    var gableShown = visible(), gableExpected = 0;
    for (var i=0;i<items.length;i++)
      if ((' '+items[i].getAttribute('data-style')+' ').indexOf(' gable ') > -1) gableExpected++;
    t('a two-tag build shows under both its styles', gableShown === gableExpected && gableExpected > 3,
      gableShown + ' shown, ' + gableExpected + ' tagged gable');

    allBtn.click();
    t('All Builds brings everything back', visible() === items.length,
      visible() + ' of ' + items.length);

    // --- the lightbox opens with the right photo and caption ---
    var lb = d.getElementById('lightbox'), lbImg = d.getElementById('lightboxImg');
    var lbCap = d.getElementById('lightboxCaption');
    var first = items[0];
    var srcWanted = first.querySelector('img').getAttribute('src');
    var titleWanted = first.querySelector('.gallery-overlay-title').textContent;
    first.click();
    t('tapping a build opens the lightbox', lb.classList.contains('open'));
    t('the lightbox shows that build\\'s photo',
      (lbImg.getAttribute('src')||'').indexOf(srcWanted) > -1,
      lbImg.getAttribute('src') + ' vs ' + srcWanted);
    t('the caption names the build', lbCap.textContent === titleWanted,
      lbCap.textContent + ' vs ' + titleWanted);
    t('the page behind it stops scrolling', d.body.style.overflow === 'hidden', d.body.style.overflow);

    // clicking the photo itself must NOT dismiss it
    lbImg.click();
    t('clicking the photo keeps it open', lb.classList.contains('open'));

    // clicking the backdrop does
    lb.click();
    t('clicking the backdrop closes it', !lb.classList.contains('open'));
    t('scrolling comes back', d.body.style.overflow === '', '"'+d.body.style.overflow+'"');

    // --- Escape closes it too ---
    items[1].click();
    var ev = new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true});
    d.dispatchEvent(ev);
    t('Escape closes the lightbox', !lb.classList.contains('open'));

    setTimeout(function(){
     try {
      // --- the page fade-in: visible by default, hidden only while JS says so ---
      var cs = w.getComputedStyle(d.body);
      t('the fade is an opacity transition', /opacity/.test(cs.transitionProperty), cs.transitionProperty);
      t('the fade is brief', parseFloat(cs.transitionDuration) <= 0.35, cs.transitionDuration);
      // a transform on <body> would break the fixed header; opacity only
      t('the fade does not move the page', cs.transform === 'none' || cs.transform === '', cs.transform);
      t('the fade-in has finished before we look', d.documentElement.className.indexOf('sp-fade') === -1,
        '"' + d.documentElement.className + '"');

      // Read the settled values, not a frame mid-transition: with the transition
      // suppressed, computed opacity is whatever the classes alone resolve to.
      d.body.style.transition = 'none';
      void d.body.offsetHeight;
      t('nothing is left faded out', parseFloat(w.getComputedStyle(d.body).opacity) === 1,
        w.getComputedStyle(d.body).opacity);

      // the hide is gated on the class JS adds, so CSS alone can never blank the site
      d.documentElement.className += ' sp-fade';
      void d.body.offsetHeight;
      var hidden = parseFloat(w.getComputedStyle(d.body).opacity);
      d.documentElement.className = d.documentElement.className.split('sp-fade').join('').trim();
      void d.body.offsetHeight;
      var back = parseFloat(w.getComputedStyle(d.body).opacity);
      d.body.style.transition = '';
      t('only the JS class hides the page', hidden === 0 && back === 1,
        hidden + ' -> ' + back + ' | class after removal: "' + d.documentElement.className + '"' +
        ' | inline transition: "' + d.body.style.transition + '"');
     } catch (e2) { t('the fade checks ran', false, e2 && e2.message); }
      done();
    }, 900);
    return;
  } catch (e) {
    t('harness ran without throwing', false, e && (e.message + ' @ ' + e.lineno));
  }
  done();
};
</script>`;

const results = await new Promise((resolve, reject) => {
  const srv = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/report') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => { res.writeHead(204).end(); srv.close(); resolve(JSON.parse(body)); });
      return;
    }
    if (req.url === '/harness.html') {
      res.writeHead(200, {'Content-Type':'text/html'}).end(HARNESS);
      return;
    }
    const clean = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    try {
      const buf = await readFile(join(ROOT, clean));
      res.writeHead(200, {'Content-Type': MIME[extname(clean)] || 'application/octet-stream'}).end(buf);
    } catch { res.writeHead(404).end('no'); }
  });
  srv.listen(PORT, '127.0.0.1', () => {
    execFile(CHROME, ['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars',
      '--window-size=1200,900','--virtual-time-budget=20000','--dump-dom',
      `http://127.0.0.1:${PORT}/harness.html`], { timeout: 90000 }, () => {});
  });
  setTimeout(() => { srv.close(); reject(new Error('the browser never reported back')); }, 80000);
});

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? '   (' + r.detail + ')' : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
