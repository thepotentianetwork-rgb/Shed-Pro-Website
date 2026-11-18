/* Cedar and Stained Cedar trim swatches: wood-grain chips on the trim
 * palette, names that survive save/load / quote / estimate, and a wood
 * material (grain only, no siding panel grooves) on every trim board —
 * corner boards, fascia, door casing, and the casing around windows and
 * vents. Painted trim must also reach those casings.
 * Run: node --test tests/ui/cedartrim.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { loadDesigner, meshes } from '../harness.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(REPO, 'designer.html'), 'utf8');
const DU_SRC = readFileSync(join(REPO, 'designer-upgrade.js'), 'utf8');
const PC_SRC = readFileSync(join(REPO, 'paint-codes.js'), 'utf8');

function setup() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  return c;
}

function hookId(c, id) {
  const nodes = {};
  const orig = c.document.getElementById;
  c.document.getElementById = (want) => {
    if (want === id || (typeof id !== 'string' && id.includes && id.includes(want))) {
      const key = want;
      if (!nodes[key]) nodes[key] = orig.call(c.document, key);
      return nodes[key];
    }
    return orig.call(c.document, want);
  };
  return nodes;
}

function hookIds(c, ids) {
  const nodes = {};
  const orig = c.document.getElementById;
  c.document.getElementById = (want) => {
    if (ids.includes(want)) {
      if (!nodes[want]) nodes[want] = orig.call(c.document, want);
      return nodes[want];
    }
    return orig.call(c.document, want);
  };
  return nodes;
}

function partsOf(m, flag) {
  return m.filter(x => {
    let p = x.obj;
    while (p) {
      if (p.userData && p.userData[flag]) return true;
      p = p.parent;
    }
    return false;
  });
}

function matsOf(parts) {
  const out = [];
  for (const p of parts) {
    const raw = p.obj.material;
    const list = Array.isArray(raw) ? raw : [raw];
    for (const m of list) if (m) out.push(m);
  }
  return out;
}

function hexOf(mat) {
  return mat.color && typeof mat.color.getHex === 'function' ? mat.color.getHex() : null;
}

function isWoodMat(mat) {
  return !!(mat && mat.map);
}

function hasPanelMaps(mat) {
  return !!(mat && (mat.bumpMap || mat.normalMap));
}

function build(c, extra) {
  Object.assign(c, {
    STYLE: 'gable', W: 12, L: 20, H: 9, PITCH: 6, OVTYPE: 'all4', OVH: 12,
    ROOFTYPE: 'shingle', INSIDE_VIEW: false, SIDING: 'vertical', PORCH_LOC: 'none', SIDE_PORCH: 0,
    EDIT_MODE: false, selectedKind: '', selectedWindow: -1, selectedDoor: -1, selectedVent: -1,
    sc: 0x6E7377, sn: 'Gray',
  }, extra || {});
  c.__stubLights();
  c.shedGroup.clear();
  c.buildShed();
  c.shedGroup.updateMatrixWorld(true);
  return meshes(c);
}

test('the trim palette puts Cedar and Stained Cedar on wood-grain chips beside the paint swatches', () => {
  const c = setup();
  const nodes = hookIds(c, ['cg-t']);
  const buildShed = c.buildShed;
  c.buildShed = () => {};
  c.TRIM_FINISH = 'paint';
  c.tn = 'White';
  c.renderWallColors();
  const html = String(nodes['cg-t'].innerHTML);
  assert.match(html, /data-wood="cedar"/);
  assert.match(html, /data-wood="stained-cedar"/);
  assert.match(html, /title="Cedar"/);
  assert.match(html, /title="Stained Cedar"/);
  assert.match(html, /class="cs cs-wood"/);
  assert.match(html, /background-image:url\(/);
  assert.match(html, /setTrimWood\('cedar'\)/);
  assert.match(html, /setTrimWood\('stained-cedar'\)/);
  // Same 30px chips as the paint colours, in the same strip — no Painted / Cedar / Wood stain button row.
  assert.match(html, /width:30px;height:30px/);
  assert.ok(!/onclick="setTrimFinish\('paint'\)"/.test(html));
  assert.ok(!/>Wood stain</.test(html));
  // A paint name is labelled when paint is selected
  assert.match(html, />White</);
  c.setTrimWood('cedar');
  const cedarHtml = String(nodes['cg-t'].innerHTML);
  assert.match(cedarHtml, />Cedar</);
  assert.match(cedarHtml, /data-wood="cedar"[^>]*border:2px solid #fff/);
  c.setTrimWood('stained-cedar');
  const stainHtml = String(nodes['cg-t'].innerHTML);
  assert.match(stainHtml, />Stained Cedar</);
  assert.match(stainHtml, /data-wood="stained-cedar"[^>]*border:2px solid #fff/);
  // Legacy Honey / Golden Cedar / Walnut only appear for an already-saved stain
  assert.ok(!/setTrimStain\('walnut'\)/.test(stainHtml));
  c.setTrimStain('walnut');
  const legacy = String(nodes['cg-t'].innerHTML);
  assert.match(legacy, /setTrimStain\('walnut'\)/);
  assert.match(legacy, /Walnut/);
  c.buildShed = buildShed;
});

test('Cedar and Stained Cedar names survive save/load, the quote and the estimate', () => {
  const c = setup();
  c.buildShed = () => {};
  vm.runInContext(PC_SRC, c, { filename: 'paint-codes.js' });
  vm.runInContext(DU_SRC, c, { filename: 'designer-upgrade.js' });
  const row = (k) => (c.DU.specRows().find(r => r[0] === k) || [])[1];

  c.setTrimWood('cedar');
  assert.equal(c.trimDisplayName(), 'Cedar');
  let cfg = c.getDesignConfig();
  assert.equal(cfg.trimFinish, 'cedar');
  assert.equal(cfg.colorNames.trim, 'Cedar');
  assert.equal(row('Trim'), 'Cedar');

  c.applyDesignConfig(JSON.parse(JSON.stringify(cfg)));
  assert.equal(c.TRIM_FINISH, 'cedar');
  assert.equal(c.trimDisplayName(), 'Cedar');
  assert.equal(c.getDesignConfig().colorNames.trim, 'Cedar');

  c.setTrimWood('stained-cedar');
  assert.equal(c.trimDisplayName(), 'Stained Cedar');
  cfg = c.getDesignConfig();
  assert.equal(cfg.trimFinish, 'stain');
  assert.equal(cfg.trimStain, 'stained-cedar');
  assert.equal(cfg.trimStainName, 'Stained Cedar');
  assert.equal(cfg.colorNames.trim, 'Stained Cedar');
  assert.equal(row('Trim'), 'Stained Cedar');

  c.applyDesignConfig(JSON.parse(JSON.stringify(cfg)));
  assert.equal(c.TRIM_FINISH, 'stain');
  assert.equal(c.TRIM_STAIN, 'stained-cedar');
  assert.equal(c.trimDisplayName(), 'Stained Cedar');
  assert.equal(c.getDesignConfig().colorNames.trim, 'Stained Cedar');

  // A design saved under the old "Natural cedar" name still opens as cedar
  c.applyDesignConfig({ v: 1, style: 'gable', w: 12, l: 16, h: 8, trimFinish: 'cedar', colorNames: { trim: 'Natural cedar' } });
  assert.equal(c.TRIM_FINISH, 'cedar');
  assert.equal(c.trimDisplayName(), 'Cedar');

  // Legacy walnut stain still loads and keeps its old name
  c.setTrimStain('walnut');
  cfg = c.getDesignConfig();
  assert.equal(cfg.trimFinish, 'stain');
  assert.equal(cfg.trimStain, 'walnut');
  assert.equal(cfg.trimStainName, 'Walnut');
  assert.equal(c.trimDisplayName(), 'Walnut wood stain');
  assert.equal(cfg.colorNames.trim, 'Walnut wood stain');
  assert.equal(row('Trim'), 'Walnut wood stain');
});

test('Stained Cedar is not a pine-siding stain, and its texture is darker than Cedar', () => {
  const c = setup();
  assert.ok(!c.PINE_STAINS.some(s => s.k === 'stained-cedar' || s.name === 'Stained Cedar'));
  assert.equal(c.STAINED_CEDAR_TRIM.k, 'stained-cedar');
  const cedar = c.makeWoodTrimTex('cedar');
  const stained = c.makeWoodTrimTex('stained-cedar');
  assert.ok(cedar && stained);
  // Source bases: natural cedar [199,154,95], stained [92,58,34]
  const src = HTML.slice(HTML.indexOf('function makeWoodTrimTex'), HTML.indexOf('function woodTrimSwatchUrl'));
  assert.match(src, /199,\s*154,\s*95/);
  assert.match(src, /92,\s*58,\s*34/);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  assert.ok(lum(92, 58, 34) < lum(199, 154, 95) * 0.6, 'stained base is clearly darker');
});

test('the wood trim texture is grain only — no plank seams, no siding bump or normal map', () => {
  const src = HTML.slice(HTML.indexOf('function makeWoodTrimTex'), HTML.indexOf('function setTrimFinish'));
  // Soffit T&G seams are a 2px fill every 64px; trim must not copy that.
  assert.ok(!/y\s*\+=\s*64/.test(src), 'trim texture must not draw 64px plank seams');
  assert.ok(!/fillRect\(0,\s*y,\s*512,\s*2\)/.test(src));
  assert.match(src, /bumpMap:\s*null/);
  assert.match(src, /normalMap:\s*null/);
  // And soffit cedar still has its seams — we did not strip those.
  const soffit = HTML.slice(HTML.indexOf('function makeCedar'), HTML.indexOf('function makeCedar') + 800);
  assert.match(soffit, /y\+=64/);

  const c = setup();
  c.setTrimWood('cedar');
  const m = c.paintMat(c.tc, 0.1);
  assert.ok(m.map, 'cedar trim has a grain map');
  assert.ok(!m.bumpMap, 'cedar trim has no bump map');
  assert.ok(!m.normalMap, 'cedar trim has no normal map');
  c.setTrimWood('stained-cedar');
  const s = c.paintMat(c.tc, 0.1);
  assert.ok(s.map, 'stained cedar trim has a grain map');
  assert.ok(!s.bumpMap);
  assert.ok(!s.normalMap);
});

test('window and vent casing follow wood trim, with no panel maps; vinyl sashes stay vinyl', () => {
  const c = setup();
  build(c, {});
  c.setTrimWood('cedar');
  let m = build(c, {});
  const win = partsOf(m, 'isWindow');
  const vent = partsOf(m, 'isVent');
  assert.ok(win.length, 'windows are built');
  assert.ok(vent.length, 'vents are built');

  const woodWin = matsOf(win).filter(isWoodMat);
  const woodVent = matsOf(vent).filter(isWoodMat);
  assert.ok(woodWin.length >= 4, 'window casing boards carry the wood map, got ' + woodWin.length);
  assert.ok(woodVent.length >= 4, 'vent casing boards carry the wood map, got ' + woodVent.length);
  for (const mat of woodWin.concat(woodVent)) {
    assert.ok(!hasPanelMaps(mat), 'trim casing must not inherit a siding bump/normal map');
  }
  // Black Vinyl sash/frame stays a dark, unmapped vinyl — not wood
  const vinyl = matsOf(win).filter(mat => {
    const hx = hexOf(mat);
    return hx != null && hx < 0x333333 && !mat.map && mat.roughness > 0.2;
  });
  assert.ok(vinyl.length >= 2, 'black vinyl sashes stay a flat dark frame colour');

  c.setTrimWood('stained-cedar');
  m = build(c, {});
  assert.ok(matsOf(partsOf(m, 'isWindow')).filter(isWoodMat).length >= 4);
  assert.ok(matsOf(partsOf(m, 'isVent')).filter(isWoodMat).length >= 4);
});

test('painted trim colour also reaches window and vent casing, not just corners', () => {
  const c = setup();
  const navy = c.WALL_COLORS.find(x => x.name === 'Navy');
  assert.ok(navy, 'Navy is on the wall/trim palette');
  c.setColor('t', navy.hex, navy.name);
  assert.equal(c.TRIM_FINISH, 'paint');
  const m = build(c, {});
  const match = (parts) => matsOf(parts).filter(mat => !mat.map && hexOf(mat) === navy.hex);
  const winPaint = match(partsOf(m, 'isWindow'));
  const ventPaint = match(partsOf(m, 'isVent'));
  assert.ok(winPaint.length >= 4, 'window casing is painted ' + navy.name + ', got ' + winPaint.length);
  assert.ok(ventPaint.length >= 4, 'vent casing is painted ' + navy.name + ', got ' + ventPaint.length);
});

test('trim finish does not change the quoted price', () => {
  const c = setup();
  c.buildShed = () => {};
  const prices = [];
  c.TRIM_FINISH = 'paint';
  c.tn = 'White';
  const snapshot = () => {
    if (typeof c.calcPrice === 'function') return c.calcPrice();
    if (typeof c.quoteTotal === 'function') return c.quoteTotal();
    if (typeof c.priceTotal === 'function') return c.priceTotal();
    if (c.PRICE != null) return c.PRICE;
    return null;
  };
  const a = snapshot();
  c.setTrimWood('cedar');
  const b = snapshot();
  c.setTrimWood('stained-cedar');
  const d = snapshot();
  if (a == null) {
    // No client-side total — confirm the finish is not referenced from money helpers.
    const moneySrc = HTML.slice(HTML.indexOf('function money('), HTML.indexOf('function money(') + 4000);
    assert.ok(!/TRIM_FINISH|trimFinish|trimStain/.test(moneySrc));
  } else {
    assert.equal(b, a);
    assert.equal(d, a);
  }
});

test('wood grain on a tall casing board runs along the board, not across it', () => {
  const c = setup();
  c.setTrimWood('cedar');
  const m = build(c, {});
  const win = partsOf(m, 'isWindow');
  // Side legs are taller than they are wide (local Y > X or Z)
  const legs = win.filter(x => {
    const sx = x.max.x - x.min.x, sy = x.max.y - x.min.y, sz = x.max.z - x.min.z;
    const mats = matsOf([x]);
    return mats.some(isWoodMat) && sy > Math.max(sx, sz) * 1.5;
  });
  assert.ok(legs.length >= 2, 'window has vertical wood casing legs, got ' + legs.length);
  for (const leg of legs) {
    assert.equal(leg.obj.geometry.userData.grainAligned, true);
    // Front face (+z) is verts 16-19. After a 90° rotate, u follows the
    // original v, so the two top verts do not share a u (they would if
    // grain still ran across the short width).
    const uv = leg.obj.geometry.attributes.uv;
    const u16 = uv.getX(16), v16 = uv.getY(16);
    const u17 = uv.getX(17), v17 = uv.getY(17);
    const u18 = uv.getX(18), v18 = uv.getY(18);
    const spanU = Math.max(u16,u17,u18,uv.getX(19)) - Math.min(u16,u17,u18,uv.getX(19));
    const spanV = Math.max(v16,v17,v18,uv.getY(19)) - Math.min(v16,v17,v18,uv.getY(19));
    assert.ok(spanU > 0.8, 'rotated U spans the tall edge, spanU=' + spanU);
  }
  const ventLegs = partsOf(m, 'isVent').filter(x => {
    const sx = x.max.x - x.min.x, sy = x.max.y - x.min.y, sz = x.max.z - x.min.z;
    return matsOf([x]).some(isWoodMat) && sy > Math.max(sx, sz) * 1.2;
  });
  assert.ok(ventLegs.length >= 2, 'vent has vertical wood casing legs');
  for (const leg of ventLegs) assert.equal(leg.obj.geometry.userData.grainAligned, true);
});
