/* Brand paint codes: the search finds what a customer types off a paint chip,
   the data is the brands' published values (spot-checked against them), and a
   pick survives the trip through getDesignConfig -> applyDesignConfig that
   share links, autosave and the quote all take.

   Run: node --test tests/ui/paintcodes.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PC_SRC = readFileSync(join(REPO, 'paint-codes.js'), 'utf8');
const BRANDS = ['sw', 'bm', 'behr', 'valspar', 'ppg', 'de'];
const DATA = Object.fromEntries(BRANDS.map(b => [b, JSON.parse(readFileSync(join(REPO, 'paint-colors', b + '.json'), 'utf8'))]));

/* paint-codes.js inside the designer's own VM, with fetch served from disk. */
function setup() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.fetch = (url) => {
    const m = /paint-colors\/(\w+)\.json$/.exec(url);
    if (!m || !DATA[m[1]]) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(DATA[m[1]]))) });
  };
  vm.runInContext(PC_SRC, c, { filename: 'paint-codes.js' });
  return c;
}
const top = (c, q) => { const h = c.PC.search(q, 5).hits[0]; return h && [h.b, h.e[0], h.e[1], h.e[2]]; };

test('every brand file is well formed and non-trivial', () => {
  for (const b of BRANDS) {
    const d = DATA[b];
    assert.equal(d.b, b);
    assert.equal(d.n, d.c.length);
    assert.ok(d.c.length > 1000, b + ' has ' + d.c.length);
    const codes = new Set();
    for (const e of d.c) {
      assert.equal(e.length, 4);
      assert.match(e[2], /^[0-9A-F]{6}$/, b + ' ' + e[0]);
      assert.ok(e[1].length > 0 && !/[\u00c2\u00ae]/.test(e[1]), b + ' name ' + e[1]);
      assert.ok(e[3].includes('|'));
      assert.ok(!codes.has(e[0]), 'duplicate ' + b + ' ' + e[0]); codes.add(e[0]);
    }
  }
});

test('published values: spot checks against the brands\' own pages', () => {
  const find = (b, code) => DATA[b].c.find(e => e[0] === code);
  assert.deepEqual(find('sw', 'SW 7006').slice(0, 3), ['SW 7006', 'Extra White', 'EEEFEA']);
  assert.deepEqual(find('sw', 'SW 7069').slice(0, 3), ['SW 7069', 'Iron Ore', '434341']);
  assert.deepEqual(find('bm', 'HC-172').slice(0, 3), ['HC-172', 'Revere Pewter', 'CBC6B8']);
  assert.deepEqual(find('bm', 'OC-17').slice(0, 3), ['OC-17', 'White Dove', 'EFEEE5']);
  assert.deepEqual(find('behr', 'PPU18-06').slice(0, 3), ['PPU18-06', 'Ultra Pure White', 'F8F8F2']);
  assert.deepEqual(find('ppg', 'PPG1025-1').slice(0, 3), ['PPG1025-1', 'Commercial White', 'EDECE6']);
});

test('search: codes and names the way people type them', async () => {
  const c = setup();
  await c.PC.loadAll();
  assert.deepEqual(top(c, 'SW 7006'), ['sw', 'SW 7006', 'Extra White', 'EEEFEA']);
  assert.deepEqual(top(c, 'sw7006'), ['sw', 'SW 7006', 'Extra White', 'EEEFEA']);
  assert.deepEqual(top(c, 'SW-7006'), ['sw', 'SW 7006', 'Extra White', 'EEEFEA']);
  assert.deepEqual(top(c, '7006'), ['sw', 'SW 7006', 'Extra White', 'EEEFEA']);
  assert.deepEqual(top(c, 'Sherwin Williams Extra White'), ['sw', 'SW 7006', 'Extra White', 'EEEFEA']);
  assert.equal(top(c, 'Extra White')[2], 'Extra White');
  assert.deepEqual(top(c, 'Behr PPU18-06'), ['behr', 'PPU18-06', 'Ultra Pure White', 'F8F8F2']);
  assert.deepEqual(top(c, 'ppu18 06'), ['behr', 'PPU18-06', 'Ultra Pure White', 'F8F8F2']);
  assert.deepEqual(top(c, 'BM HC-172'), ['bm', 'HC-172', 'Revere Pewter', 'CBC6B8']);
  assert.deepEqual(top(c, 'hc172'), ['bm', 'HC-172', 'Revere Pewter', 'CBC6B8']);
  assert.deepEqual(top(c, 'Revere Pewter'), ['bm', 'HC-172', 'Revere Pewter', 'CBC6B8']);
  assert.deepEqual(top(c, 'revere pew'), ['bm', 'HC-172', 'Revere Pewter', 'CBC6B8']);
  assert.deepEqual(top(c, 'Glidden PPG1025-1'), ['ppg', 'PPG1025-1', 'Commercial White', 'EDECE6']);
  assert.equal(top(c, 'painters white')[2], "Painter's White");
  // A brand on its own, or nonsense, gives nothing rather than everything —
  // except Behr, which lists its popular exterior colours (Nando, Nov 2026).
  assert.equal(c.PC.search('sw', 40).hits.length, 0);
  assert.equal(c.PC.search('Benjamin Moore', 40).hits.length, 0);
  assert.equal(c.PC.search('zzzqqq', 40).hits.length, 0);
  // Brand-scoped queries stay in the brand.
  assert.ok(c.PC.search('valspar white', 40).hits.every(h => h.b === 'valspar'));
});

test('"behr" on its own lists Behr\'s popular exterior colours, real codes and hexes', async () => {
  const c = setup();
  await c.PC.loadAll(['behr']);
  for (const q of ['behr', 'BEHR', 'Behr paint', 'behr colors', ' behr ']) {
    const r = c.PC.search(q, 40);
    assert.ok(r.popular, q);
    assert.ok(r.hits.length >= 12 && r.hits.length <= 20, q + ' -> ' + r.hits.length);
    assert.ok(r.hits.every(h => h.b === 'behr'));
  }
  const hits = c.PC.search('behr', 40).hits.map(h => h.e.slice(0, 3));
  assert.deepEqual(hits[0], ['12', 'Swiss Coffee', 'F1EDE0']);
  assert.ok(hits.some(e => e[0] === 'PPU18-01' && e[1] === 'Cracked Pepper' && e[2] === '4F5152'));
  // every listed code exists in the colour book (no invented entries)
  for (const e of hits) assert.ok(DATA.behr.c.some(x => x[0] === e[0] && x[2] === e[2]), e[0]);
  // a real name search under the brand still searches
  assert.equal(c.PC.search('behr swiss coffee', 5).hits[0].e[0], '12');
  assert.ok(!c.PC.search('behr swiss coffee', 5).popular);
  // and picking one applies like any other brand pick
  c.__stubLights();
  const h = c.PC.search('behr', 40).hits[0];
  c.PC.applyPick('s', h.b, h.e);
  assert.equal(c.sc, 0xF1EDE0);
  assert.equal(c.sn, 'Behr 12 Swiss Coffee');
});

test('a brand query loads only that brand', async () => {
  const c = setup();
  const asked = [];
  const f = c.fetch; c.fetch = (u) => { asked.push(u); return f(u); };
  const P = c.PC.parseQuery('Behr PPU18-06');
  assert.equal(P.brand, 'behr');
  await c.PC.loadAll([P.brand]);
  assert.deepEqual(asked, ['paint-colors/behr.json']);
});

test('a pick colours the shed, and survives save -> reopen', async () => {
  const c = setup();
  await c.PC.loadAll();
  c.__stubLights();
  const sw = c.PC.search('SW 7006', 1).hits[0];
  const behr = c.PC.search('Behr PPU18-01', 1).hits[0];
  const bm = c.PC.search('Revere Pewter', 1).hits[0];
  c.PC.applyPick('s', behr.b, behr.e);
  c.PC.applyPick('t', sw.b, sw.e);
  c.PC.applyPick('d', bm.b, bm.e);
  assert.equal(c.sc, 0x4F5152);
  assert.equal(c.sn, 'Behr PPU18-01 Cracked Pepper');
  assert.equal(c.tn, 'Sherwin-Williams SW 7006 Extra White');
  assert.equal(c.DOOR_PAINT, 0xCBC6B8);
  // The door leaf was drawn in the door colour, not the siding's.
  assert.ok(c._canvasCache['siding:' + 0xCBC6B8 + ':' + c.SIDING], 'door texture in Revere Pewter');

  const cfg = JSON.parse(JSON.stringify(c.getDesignConfig()));
  assert.deepEqual(cfg.paint.siding, { brand: 'Behr', code: 'PPU18-01', name: 'Cracked Pepper', hex: '#4F5152' });
  assert.deepEqual(cfg.paint.trim, { brand: 'Sherwin-Williams', code: 'SW 7006', name: 'Extra White', hex: '#EEEFEA' });
  assert.equal(cfg.colorNames.siding, 'Behr PPU18-01 Cracked Pepper');
  assert.equal(cfg.colorNames.door, 'Benjamin Moore HC-172 Revere Pewter');
  assert.equal(cfg.doorColor, 0xCBC6B8);
  assert.equal(cfg.sidingColor, 0x4F5152);

  // Reopen in a fresh page.
  const d = setup(); d.__stubLights();
  d.applyDesignConfig(cfg);
  assert.equal(d.sc, 0x4F5152);
  assert.equal(d.sn, 'Behr PPU18-01 Cracked Pepper');
  assert.equal(d.tn, 'Sherwin-Williams SW 7006 Extra White');
  assert.equal(d.DOOR_PAINT, 0xCBC6B8);
  assert.equal(d.PC.livePick('s').code, 'PPU18-01');
  assert.deepEqual(JSON.parse(JSON.stringify(d.getDesignConfig().paint)), cfg.paint);
});

test('picking a preset afterwards drops the brand claim', async () => {
  const c = setup();
  await c.PC.load('sw');
  c.__stubLights();
  const sw = c.PC.search('SW 7006', 1).hits[0];
  c.PC.applyPick('s', sw.b, sw.e);
  assert.ok(c.getDesignConfig().paint.siding);
  c.setColor('s', 0x2C3E52, 'Navy');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.paint, undefined);
  assert.equal(cfg.colorNames.siding, 'Navy');
  // Typing the same hex by hand is a custom colour, not SW 7006.
  c.PC.applyPick('s', sw.b, sw.e);
  c.applyHexSiding('#EEEFEA');
  assert.equal(c.getDesignConfig().paint, undefined);
});

test('a design saved before this feature reopens unchanged', () => {
  const c = setup(); c.__stubLights();
  const old = { v: 1, style: 'gable', w: 10, l: 12, h: 8, sidingColor: 0x2C3E52, trimColor: 0xF2F0EC, roofColor: 0x28282A };
  c.applyDesignConfig(old);
  assert.equal(c.DOOR_PAINT, null);
  const cfg = c.getDesignConfig();
  assert.equal(cfg.paint, undefined);
  assert.equal(cfg.doorColor, undefined);
  assert.equal(cfg.sidingColor, 0x2C3E52);
});

test('the review sheet names each brand colour and carries the disclaimer', async () => {
  const c = setup();
  vm.runInContext(readFileSync(join(REPO, 'designer-upgrade.js'), 'utf8'), c, { filename: 'designer-upgrade.js' });
  await c.PC.loadAll();
  c.__stubLights();
  const row = (k) => (c.DU.specRows().find(r => r[0] === k) || [])[1];
  // Nothing picked yet: no door row, no disclaimer.
  assert.equal(row('Door color'), undefined);
  assert.equal(c.DU.paintNote(), '');
  const sw = c.PC.search('SW 7006', 1).hits[0];
  const behr = c.PC.search('Behr PPU18-01', 1).hits[0];
  const bm = c.PC.search('Revere Pewter', 1).hits[0];
  c.PC.applyPick('s', sw.b, sw.e);
  c.PC.applyPick('t', behr.b, behr.e);
  c.PC.applyPick('d', bm.b, bm.e);
  assert.match(row('Siding'), /Sherwin-Williams SW 7006 Extra White$/);
  assert.equal(row('Trim'), 'Behr PPU18-01 Cracked Pepper');
  assert.equal(row('Door color'), 'Benjamin Moore HC-172 Revere Pewter');
  assert.equal(c.DU.paintNote(), "On-screen colors are approximate. We'll confirm your exact color with you before painting.");
});

test('nothing fetches a paint book until someone searches', () => {
  const c = setup();
  const asked = [];
  const f = c.fetch; c.fetch = (u) => { asked.push(u); return f(u); };
  // Boot ran inside setup(); a fresh config round trip must not load anything either.
  c.applyDesignConfig(JSON.parse(JSON.stringify(c.getDesignConfig())));
  assert.deepEqual(asked.filter(u => /paint-colors/.test(u)), []);
  assert.deepEqual(Object.keys(c.PC._data), []);
});

test('brand paint search sits in a bottom color-step section, not in the Siding or Trim sections', () => {
  const html = readFileSync(join(REPO, 'designer.html'), 'utf8');
  const step = html.slice(html.indexOf('data-step="3"'), html.indexOf('<!-- STEP 7'));
  const slice = (from, to) => {
    const a = step.indexOf(from); const b = step.indexOf(to, a + 1);
    assert.ok(a >= 0 && b > a, from + ' .. ' + to);
    return step.slice(a, b);
  };
  const siding = slice('data-csec="s"', 'data-csec="t"');
  const trim = slice('data-csec="t"', 'data-csec="d"');
  const door = slice('data-csec="d"', 'data-csec="r"');
  const roof = slice('data-csec="r"', 'data-csec="brand"');
  const brand = step.slice(step.indexOf('data-csec="brand"'));
  assert.ok(siding.includes('id="cg-s"'));
  assert.ok(!siding.includes('pc-host'));
  assert.ok(trim.includes('id="cg-t"'));
  assert.ok(!trim.includes('pc-host'));
  assert.ok(!door.includes('pc-host'));
  assert.ok(door.includes('id="cg-d"'));
  assert.ok(roof.includes('id="cg-r"'));
  assert.ok(!roof.includes('pc-host'));
  assert.match(brand, /Know your preferred paint\? Select from popular brands and colors/);
  assert.match(brand, /Search any brand color by name or code for your siding, trim, or door\./);
  assert.ok(brand.includes('data-part="s"') && brand.includes('data-part="t"') && brand.includes('data-part="d"'));
  assert.ok(!brand.includes('data-part="i"'));
  // labelled, in that order
  const labels = [...brand.matchAll(/class="pc-part-name">([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(labels, ['Siding', 'Trim', 'Door']);
  // interior search stays on the Interior step
  const rest = html.slice(html.indexOf('<!-- STEP 7'));
  assert.ok(rest.includes('class="pc-host" data-part="i"'));
});

test('the color step uses the same labels and spacing as the other steps, with no icons or cards', () => {
  const html = readFileSync(join(REPO, 'designer.html'), 'utf8');
  const step = html.slice(html.indexOf('data-step="3"'), html.indexOf('<!-- STEP 7'));
  const size = html.slice(html.indexOf('data-step="1"'), html.indexOf('data-step="2"'));
  const roofStep = html.slice(html.indexOf('data-step="4"'), html.indexOf('data-step="5"'));
  assert.ok(!step.includes('csec-ico'));
  assert.ok(!step.includes('class="csec"') && !/class="grp csec/.test(step));
  assert.ok(!/\.csec[^-a-z]/.test(html.slice(0, html.indexOf('</style>'))));
  for (const label of ['Siding Color', 'Trim Color', 'Door Color', 'Roof Color']) {
    assert.match(step, new RegExp('class="lbl">' + label + '<'));
  }
  assert.match(step, /class="wstep-sub"[^>]*>The main wall panels\./);
  // Same heading and hint classes the Size and Roof steps already use
  assert.match(size, /class="lbl">Popular Sizes</);
  assert.match(roofStep, /class="lbl">Roof Type</);
  assert.match(size, /class="wstep-sub"|class="sv"/);
});

test('a brand pick from applyPick still updates siding, trim and door colour state', async () => {
  const c = setup();
  await c.PC.loadAll();
  c.__stubLights();
  const behr = c.PC.search('Behr PPU18-01', 1).hits[0];
  const sw = c.PC.search('SW 7006', 1).hits[0];
  c.PC.applyPick('s', behr.b, behr.e);
  c.PC.applyPick('t', sw.b, sw.e);
  assert.equal(c.sn, 'Behr PPU18-01 Cracked Pepper');
  assert.equal(c.tn, 'Sherwin-Williams SW 7006 Extra White');
  const bm = c.PC.search('Revere Pewter', 1).hits[0];
  c.PC.applyPick('d', bm.b, bm.e);
  assert.equal(c.DOOR_PAINT, parseInt(bm.e[2], 16));
  assert.equal(c.PC.livePick('d').name, 'Revere Pewter');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.colorNames.siding, 'Behr PPU18-01 Cracked Pepper');
  assert.equal(cfg.colorNames.trim, 'Sherwin-Williams SW 7006 Extra White');
  assert.equal(cfg.colorNames.door, 'Benjamin Moore HC-172 Revere Pewter');
  assert.equal(cfg.doorColor, c.DOOR_PAINT);
});

test('color-step roof swatches use the same list as the Roof step and stay in sync', () => {
  const c = setup();
  const nodes = {};
  const orig = c.document.getElementById;
  c.document.getElementById = (id) => {
    if (id === 'roofColorList' || id === 'cg-r') {
      if (!nodes[id]) nodes[id] = orig.call(c.document, id);
      return nodes[id];
    }
    return orig.call(c.document, id);
  };
  const build = c.buildShed;
  c.buildShed = () => {};
  // Names from the VM context are another-realm strings; compare as local text.
  const names = (html) => [...String(html).matchAll(/title="([^"]+)"/g)].map(m => m[1]);
  const listNames = (list) => [...list].map(x => String(x.name));
  c.ROOFTYPE = 'metal';
  c.rc = c.METAL_COLORS[0].hex;
  c.rn = String(c.METAL_COLORS[0].name);
  c.renderRoofColors();
  assert.deepEqual(names(nodes['cg-r'].innerHTML), listNames(c.METAL_COLORS));
  assert.equal(String(nodes['cg-r'].innerHTML), String(nodes.roofColorList.innerHTML));
  c.setColor('r', c.METAL_COLORS[2].hex, String(c.METAL_COLORS[2].name));
  assert.equal(c.rc, c.METAL_COLORS[2].hex);
  assert.equal(String(c.rn), String(c.METAL_COLORS[2].name));
  assert.equal(String(nodes['cg-r'].innerHTML), String(nodes.roofColorList.innerHTML));
  assert.match(String(nodes['cg-r'].innerHTML), new RegExp(String(c.METAL_COLORS[2].name)));
  c.setRoofType('shingle');
  assert.equal(String(c.ROOFTYPE), 'shingle');
  assert.deepEqual(names(nodes['cg-r'].innerHTML), listNames(c.SHINGLE_COLORS));
  assert.equal(String(nodes['cg-r'].innerHTML), String(nodes.roofColorList.innerHTML));
  c.setColor('r', c.SHINGLE_COLORS[1].hex, String(c.SHINGLE_COLORS[1].name));
  assert.equal(c.rc, c.SHINGLE_COLORS[1].hex);
  assert.equal(String(c.rn), String(c.SHINGLE_COLORS[1].name));
  assert.equal(nodes['cg-r'].innerHTML, nodes.roofColorList.innerHTML);
  c.buildShed = build;
});

test('door color swatches and Match siding use the existing doorColor path', () => {
  const c = setup();
  const nodes = {};
  const orig = c.document.getElementById;
  c.document.getElementById = (id) => {
    if (id === 'cg-d') {
      if (!nodes[id]) nodes[id] = orig.call(c.document, id);
      return nodes[id];
    }
    return orig.call(c.document, id);
  };
  const build = c.buildShed;
  c.buildShed = () => {};
  c.sc = 0x2C3E52;
  c.renderDoorColors();
  assert.match(String(nodes['cg-d'].innerHTML), /Match siding/);
  assert.match(String(nodes['cg-d'].innerHTML), /Matches siding/);
  const white = c.WALL_COLORS[0];
  c.setDoorPaintColor(white.hex);
  assert.equal(c.DOOR_PAINT, white.hex);
  const cfg = c.getDesignConfig();
  assert.equal(cfg.doorColor, white.hex);
  assert.equal(cfg.colorNames.door, white.name);
  assert.match(String(nodes['cg-d'].innerHTML), new RegExp(white.name));
  // A save/load round trip keeps the door colour
  c.DOOR_PAINT = null;
  c.applyDesignConfig(JSON.parse(JSON.stringify(cfg)));
  assert.equal(c.DOOR_PAINT, white.hex);
  c.matchDoorToSiding();
  assert.equal(c.DOOR_PAINT, null);
  const cfg2 = c.getDesignConfig();
  assert.equal(cfg2.doorColor, undefined);
  assert.match(String(nodes['cg-d'].innerHTML), /Matches siding/);
  c.buildShed = build;
});
