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
  // A brand on its own, or nonsense, gives nothing rather than everything.
  assert.equal(c.PC.search('behr', 40).hits.length, 0);
  assert.equal(c.PC.search('zzzqqq', 40).hits.length, 0);
  // Brand-scoped queries stay in the brand.
  assert.ok(c.PC.search('valspar white', 40).hits.every(h => h.b === 'valspar'));
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
