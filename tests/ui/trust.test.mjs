/* designer-trust: the review bubble only ever shows the home page's real
   reviews (verbatim, same names), the concrete-pad promo matches the home
   page's wording and end date, and the Modern Studio lean-to starter has its
   row of vertical transoms up under the roofline with exactly one porch light
   over the door.

   Run: node --test tests/ui/trust.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = readFileSync(join(REPO, 'index.html'), 'utf8');
const DT_SRC = readFileSync(join(REPO, 'designer-trust.js'), 'utf8');
const DESIGNER = readFileSync(join(REPO, 'designer.html'), 'utf8');

function decode(s) {
  return s.replace(/<br\s*\/?>/g, '\n').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
function homeReviews() {
  const out = [];
  const re = /<figure class="rv-card (is-g|is-fb)[^"]*">([\s\S]*?)<\/figure>/g; let m;
  while ((m = re.exec(INDEX))) {
    const text = decode(/<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/.exec(m[2])[1]);
    const [, name, label] = /<strong>(.*?)<\/strong><small>(.*?)<\/small>/.exec(m[2]);
    out.push({ src: m[1] === 'is-g' ? 'google' : 'facebook', name, label, text });
  }
  return out;
}
function loadDT(now) {
  const store = {};
  const ctx = { window: {}, document: { readyState: 'loading', addEventListener() {} },
    sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    matchMedia: () => ({ matches: false }), getComputedStyle: () => ({}), setInterval, clearInterval, setTimeout };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(DT_SRC, ctx);
  if (now) ctx.DT.now = () => now;
  return ctx.DT;
}

test('every bubble review is a real home-page review, verbatim, with the same name and source', () => {
  const home = homeReviews(), DT = loadDT();
  assert.ok(home.length >= 10, 'found the home page reviews');
  assert.equal(DT.REVIEWS.length, home.length, 'same set as the home page');
  DT.REVIEWS.forEach((r, i) => {
    assert.equal(r.text, home[i].text, 'text verbatim: ' + r.name);
    assert.equal(r.name, home[i].name); assert.equal(r.label, home[i].label); assert.equal(r.src, home[i].src);
    assert.equal(r.stars, r.src === 'google' ? 5 : null, 'Facebook recommendations carry no star rating');
  });
});

test('the totals in the bubble are the ones the home page shows', () => {
  const DT = loadDT();
  assert.match(INDEX, new RegExp('<strong>' + DT.TOTALS.google.rating + '</strong>[\\s\\S]{0,80}' + DT.TOTALS.google.count + ' Google reviews'));
  assert.match(INDEX, new RegExp(DT.TOTALS.facebook.rec + '</strong>[\\s\\S]{0,120}' + DT.TOTALS.facebook.count + ' Facebook reviews'));
});

test('promo: same wording and end date as the home page, gone from Nov 4, 2026', () => {
  const DT = loadDT();
  assert.match(INDEX, /data-promo-ends="2026-11-04"/);
  assert.ok(INDEX.includes('<strong>$500 off a concrete pad</strong> when you buy a shed.'));
  assert.ok(INDEX.includes(DT.PROMO.fine), 'fine print matches the home page');
  DT.now = () => new Date('2026-11-03T23:59:00');
  assert.match(DT.promoHTML('review'), /\$500 off a concrete pad/);
  DT.now = () => new Date('2026-11-04T00:00:01');
  assert.equal(DT.promoHTML('review'), '');
  assert.ok(DESIGNER.includes("DT.promoHTML('quote')"), 'promo is in the quote form');
  assert.ok(DESIGNER.includes('<script src="designer-trust.js"></script>'));
});

test('Modern Studio lean-to: one big vertical window, head level with the door head, clear of the walls', () => {
  const src = /\{k:'modern-studio'[\s\S]*?addons:\{\}\}\}/.exec(DESIGNER)[0];
  const u = vm.runInNewContext('(' + src + ')');
  assert.equal(u.cfg.style, 'leanto');
  const front = u.cfg.windows.filter(w => w.wall === 'front');
  assert.equal(front.length, 1, 'exactly one front window');
  const w = front[0], d = u.cfg.doors[0];
  assert.equal(w.type, 'Black Vinyl 24x36', 'the largest upright window the pricing worker prices');
  assert.ok(DESIGNER.includes('key:"Black Vinyl 24x36"'), 'a real catalog option');
  assert.ok(w.h > w.w, 'vertical');
  assert.equal(w.cy + w.h / 2, d.h, 'window head lines up with the door head');
  // real inches along the wall (posToAxis: margin = width/2 + 7.2in)
  const len = u.cfg.w * 12;
  const at = (pos, wIn) => { const m = wIn / 2 + 7.2; return m + pos * (len - 2 * m); };
  const wc = at(w.pos, w.w), dc = at(d.pos, d.w);
  const winL = wc - (w.w + 6.6) / 2, winR = wc + (w.w + 6.6) / 2, doorR = dc + (d.w + 7) / 2;
  assert.ok(winR <= len - 3.6 - 12, 'a foot or more of siding between the window casing and the corner');
  assert.ok(winL - doorR >= 30, 'room for the porch light between door and window');
  assert.equal(u.cfg.porchLights.length, 2, 'two porch lights');
  assert.match(u.sub, /^16×12 Lean-To · Cedar doors, big vertical window & 2 porch lights/);
});

test('the two porch lights flank the door symmetrically at fixture height, clear of the window', () => {
  const { c } = loadDesigner();
  const src = /\{k:'modern-studio'[\s\S]*?addons:\{\}\}\}/.exec(DESIGNER)[0];
  const u = vm.runInNewContext('(' + src + ')');
  vm.runInContext(`(function(cfg){
    STYLE=cfg.style; W=cfg.w; L=cfg.l; H=cfg.h;
    doorsData=JSON.parse(JSON.stringify(cfg.doors));
    windowsData=cfg.windows.map(function(w){ var o=Object.assign({},w); if(o.cy==null) o.cy=defaultCyFor(o.h,o.type,o.w); return o; });
    porchLightsData=JSON.parse(JSON.stringify(cfg.porchLights));
  })(${JSON.stringify(u.cfg)})`, c);
  const p = vm.runInContext('computePorchLightPlacement()', c);
  assert.equal(p.length, 2);
  p.forEach(x => assert.equal(x.mount, 'side', 'beside the door, not above it'));
  const IN = 0.2 / 12;
  const doorC = vm.runInContext("(function(){var f=wallFrame('front');var o=plObstacles('front');return plPrimaryDoor(o,f).c;})()", c);
  assert.ok(Math.abs((doorC - p[0].s) - (p[1].s - doorC)) < 1e-6, 'same distance each side');
  p.forEach(x => { const y = x.y / IN; assert.ok(y >= 66 && y <= 72.01, 'fixture centre 66-72in, got ' + y); });
  // the right-hand light keeps real siding between it and the window casing
  const w = u.cfg.windows.find(v => v.wall === 'front');
  const len = u.cfg.w * 12, m = w.w / 2 + 7.2, wc = m + w.pos * (len - 2 * m);
  const lightR = p[1].s / IN + 2;                 // modern fixture is 4in wide
  assert.ok(wc - (w.w + 6.6) / 2 - lightR >= 12, 'at least a foot of siding to the window');
});
