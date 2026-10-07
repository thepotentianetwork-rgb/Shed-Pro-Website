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

test('Modern Studio lean-to: three vertical transoms high on the front, one porch light over the door', () => {
  const src = /\{k:'modern-studio'[\s\S]*?addons:\{\}\}\}/.exec(DESIGNER)[0];
  const u = vm.runInNewContext('(' + src + ')');
  assert.equal(u.cfg.style, 'leanto');
  const front = u.cfg.windows.filter(w => w.wall === 'front');
  assert.equal(front.length, 3);
  front.forEach(w => { assert.match(w.type, /^Black Transom 12x30$/); assert.ok(w.h > w.w * 2, 'vertical'); });
  const cy = new Set(front.map(w => w.cy)); assert.equal(cy.size, 1, 'one level');
  const wallIn = u.cfg.h * 12; const top = front[0].cy + front[0].h / 2;
  assert.ok(top <= wallIn - 6 && top >= wallIn - 14, 'tops sit just under the roofline trim');
  const d = u.cfg.doors[0];
  assert.ok(front[0].cy - front[0].h / 2 < d.h && top > d.h, 'they rise above the door head');
  // even spacing (in the wall's real inches)
  const lenIn = u.cfg.w * 12, m = 12 / 2 + 7.2, x = front.map(w => m + w.pos * (lenIn - 2 * m));
  assert.ok(Math.abs((x[1] - x[0]) - (x[2] - x[1])) < 0.6, 'evenly spaced');
  assert.equal(u.cfg.porchLights.length, 1, 'exactly one porch light');
  // the windows are real catalog options, so they price like any other window
  assert.ok(DESIGNER.includes('key:"Black Transom 12x30", label:"Vertical Transom 12x30'));
});

test('the one porch light lands above the door head, on the wall, clear of the transoms', () => {
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
  assert.equal(p.length, 1); assert.equal(p[0].mount, 'above');
  const doorC = vm.runInContext("(function(){var f=wallFrame('front');var o=plObstacles('front');return plPrimaryDoor(o,f).c;})()", c);
  assert.ok(Math.abs(p[0].s - doorC) < 1e-6, 'centred over the door');
});
