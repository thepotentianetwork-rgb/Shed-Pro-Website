/* SWATCH ACCURACY - does a hex on the shed render as that hex?
 *
 * Renders eight swatches (white, light grey, mid grey, Behr Cracked Pepper,
 * black, navy, sage, tan) on the siding, the trim and a door painted with a
 * paint code, in a real browser with real WebGL, and compares the rendered
 * pixels with the hex. Masks are found by rendering each part in red and
 * then green and keeping the pixels that changed, so nothing here depends on
 * how the page builds its materials. Pixels are grouped by the wall they sit
 * on (raycast normal): "right" is the wall out of direct sun - the
 * shade-neutral one to judge colour on - and "front" is the sunlit door wall.
 *
 *   python3 -m http.server 8761 &      # from the repo root
 *   PW=/path/with/node_modules/playwright-core CHROME=/usr/bin/google-chrome \
 *     node tests/visual/swatches.mjs http://127.0.0.1:8761/designer.html after /tmp/swatches
 *
 * Prints per-swatch medians with the RGB distance to the hex, writes
 * <tag>-measure.json and screenshots of Cracked Pepper trim on white siding
 * and navy siding with white trim at 1440x900 and 390x844. ONLY=1440 or
 * ONLY=390 limits it to one viewport. Every Worker call is stubbed.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || 'playwright-core');
const URL = process.argv[2], TAG = process.argv[3], OUT = process.argv[4];
const PRE = process.argv[5] ? (await import('node:fs')).readFileSync(process.argv[5], 'utf8') : '';
const ONLY = process.env.ONLY || '';
mkdirSync(OUT, { recursive: true });
const SW = [['White', 0xF2F0EC], ['Light gray', 0xC9CCCF], ['Mid gray', 0x808080], ['Cracked Pepper', 0x4F5152], ['Black', 0x1E1E1E], ['Navy', 0x2C3E52], ['Sage', 0x8A9A7B], ['Tan', 0xC8B48F]];
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = {};
for (const [vtag, vp, mobile] of [['1440', { width: 1440, height: 900 }, false], ['390', { width: 390, height: 844 }, true]]) {
  if (ONLY && ONLY !== vtag) continue;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await ctx.route(/potentia-assistant\.thepotentianetwork\.workers\.dev/, rt => rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ total: 9999, optionPrices: {} }) }));
  await ctx.route('**/_vercel/**', rt => rt.fulfill({ status: 200, body: '' }));
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(4000);
  await page.evaluate(() => { const r = document.getElementById('duResume'); if (r) r.remove(); });
  if (PRE) { await page.evaluate(PRE); await page.waitForTimeout(500); }
  await page.screenshot({ path: `${OUT}/${TAG}-${vtag}-default-preset.png` });
  const data = await page.evaluate((SW) => {
    const cv = renderer.domElement, Wd = cv.width, Hd = cv.height, rect = cv.getBoundingClientRect(), dpr = Wd / rect.width;
    const c2 = document.createElement('canvas'); c2.width = Wd; c2.height = Hd; const x = c2.getContext('2d', { willReadFrequently: true });
    const grab = () => { renderer.render(scene, camera); x.clearRect(0, 0, Wd, Hd); x.drawImage(cv, 0, 0); return x.getImageData(0, 0, Wd, Hd).data; };
    const set = (s, t, d) => { sc = s; sn = 'm'; tc = t; tn = 'm'; DOOR_PAINT = (d == null ? null : d); buildShed(); };
    const diffMask = (a, b) => { const m = new Uint8Array(Wd * Hd); for (let i = 0; i < m.length; i++) { const d = Math.abs(a[i*4] - b[i*4]) + Math.abs(a[i*4+1] - b[i*4+1]); m[i] = d > 80 ? 1 : 0; } return m; };
    const erode = (m) => { const o = new Uint8Array(m.length); for (let y = 2; y < Hd - 2; y++) for (let X = 2; X < Wd - 2; X++) { let ok = 1; for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (!m[(y+dy)*Wd + X+dx]) { ok = 0; break; } o[y*Wd+X] = ok; } return o; };
    // masks
    set(0x808080, 0xFF0000); const t1 = grab(); set(0x808080, 0x00FF00); const t2 = grab();
    const trimM = erode(diffMask(t1, t2));
    set(0xFF0000, 0x808080); const s1 = grab(); set(0x00FF00, 0x808080); const s2 = grab();
    const sideM = erode(diffMask(s1, s2));
    set(0x808080, 0x808080, 0xFF0000); const d1 = grab(); set(0x808080, 0x808080, 0x00FF00); const d2 = grab();
    const doorM = erode(diffMask(d1, d2));
    // face classification by raycast normal, sampled
    const rc = new THREE.Raycaster();
    const faceOf = (px, py) => {
      const v = new THREE.Vector2((px / dpr) / rect.width * 2 - 1, -(py / dpr) / rect.height * 2 + 1);
      rc.setFromCamera(v, camera); const h = rc.intersectObjects(shedGroup.children, true)[0];
      if (!h || !h.face) return null;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (Math.abs(n.y) > 0.5) return null;                    // vertical faces only
      return Math.abs(n.z) > Math.abs(n.x) ? (n.z > 0 ? 'front' : 'back') : (n.x > 0 ? 'right' : 'left');
    };
    const groups = (m, stride) => { const g = {}; for (let y = 0; y < Hd; y += stride) for (let X = 0; X < Wd; X += stride) { const i = y*Wd + X; if (!m[i]) continue; const f = faceOf(X, y); if (!f) continue; (g[f] = g[f] || []).push(i); } return g; };
    const gT = groups(trimM, 2), gS = groups(sideM, 3), gD = groups(doorM, 2);
    const med = (d, idx) => { const ch = [0, 1, 2].map(c => idx.map(i => d[i*4+c]).sort((a, b) => a - b)); return ch.map(a => a[a.length >> 1]); };
    const out = { counts: { trim: Object.fromEntries(Object.entries(gT).map(([k, v]) => [k, v.length])), siding: Object.fromEntries(Object.entries(gS).map(([k, v]) => [k, v.length])), door: Object.fromEntries(Object.entries(gD).map(([k, v]) => [k, v.length])) }, rows: [] };
    for (const [name, hex] of SW) {
      set(hex, hex); const d = grab(); const row = { name, hex: '#' + hex.toString(16).padStart(6, '0').toUpperCase(), siding: {}, trim: {}, door: {} };
      for (const [f, idx] of Object.entries(gS)) if (idx.length > 30) row.siding[f] = med(d, idx);
      for (const [f, idx] of Object.entries(gT)) if (idx.length > 10) row.trim[f] = med(d, idx);
      set(0x808080, 0x808080, hex); const dd = grab();
      for (const [f, idx] of Object.entries(gD)) if (idx.length > 30) row.door[f] = med(dd, idx);
      out.rows.push(row);
    }
    set(0x6E7377, 0xF2F0EC, null);
    return out;
  }, SW);
  data.errors = errs;
  result[vtag] = data;
  // screenshots: Cracked Pepper trim on white siding, and navy siding with white trim
  await page.evaluate(() => { sc = 0xF2F0EC; sn = 'White'; tc = 0x4F5152; tn = 'Cracked Pepper'; buildShed(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${TAG}-${vtag}-white-siding-cracked-pepper-trim.png` });
  await page.evaluate(() => { sc = 0x2C3E52; sn = 'Navy'; tc = 0xF2F0EC; tn = 'White'; buildShed(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${TAG}-${vtag}-navy-siding-white-trim.png` });
  await ctx.close();
}
writeFileSync(`${OUT}/${TAG}-measure.json`, JSON.stringify(result, null, 1));
await browser.close();
// summary
const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
for (const [v, d] of Object.entries(result)) {
  console.log(`== ${TAG} ${v}  faces siding=${JSON.stringify(d.counts.siding)} trim=${JSON.stringify(d.counts.trim)} door=${JSON.stringify(d.counts.door)} errors=${d.errors.length}`);
  const mean = (part, face) => { const v = d.rows.map(r => r[part][face] && Math.hypot(...r[part][face].map((x, i) => x - hexRGB(r.hex)[i]))).filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; };
  console.log(`mean RGB distance  siding right ${mean('siding','right')} front ${mean('siding','front')} | trim right ${mean('trim','right')} front ${mean('trim','front')} | door front ${mean('door','front')}`);
  for (const r of d.rows) {
    const h = hexRGB(r.hex), fmt = p => p ? `${p.join(',')}(Δ${Math.round(Math.hypot(p[0]-h[0], p[1]-h[1], p[2]-h[2]))})` : '-';
    console.log(`${r.name.padEnd(15)} ${r.hex}  siding front ${fmt(r.siding.front)} right ${fmt(r.siding.right)} | trim front ${fmt(r.trim.front)} right ${fmt(r.trim.right)} | door front ${fmt(r.door.front)}`);
  }
}
