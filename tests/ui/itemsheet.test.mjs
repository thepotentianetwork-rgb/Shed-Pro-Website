/* TAP A PLACED ITEM -> REPLACE / REMOVE / CANCEL (preview, 19 Nov 2026).
 *   node --test tests/ui/itemsheet.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';
import vmMod from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const DU_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer-upgrade.js'), 'utf8');
const await_import_vm = () => vmMod;

function setup() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  c.doorsData.length = 0; c.windowsData.length = 0;
  c.doorsData.push({ wall: 'front', pos: 0.5, style: 'basic', w: 72, h: 76 });
  c.doorsData.push({ wall: 'back', pos: 0.5, style: 'basic', w: 36, h: 76 });
  c.windowsData.push({ wall: 'left', pos: 0.4, type: c.WINDOW_CATALOG[0].key, w: c.WINDOW_CATALOG[0].w, h: c.WINDOW_CATALOG[0].h });
  c.windowsData.push({ wall: 'right', pos: 0.6, type: c.WINDOW_CATALOG[0].key, w: c.WINDOW_CATALOG[0].w, h: c.WINDOW_CATALOG[0].h });
  c.buildShed();
  return c;
}
const buttons = (h) => [...h.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map((m) => m[1]);

test('a window sheet: short name by wall (door wall = Front), exactly Replace, Remove, Cancel', () => {
  const c = setup();
  assert.equal(c.itemSheetName('window', 0), 'Transom window 12\u00d724 \u00b7 White frame \u00b7 ' + c.trimDisplayName() + ' trim on Left wall');
  assert.deepEqual(buttons(c.itemSheetHTML('window', 0)), ['Replace', 'Duplicate', 'Remove', 'Cancel']);
  assert.ok(!/Move|Delete/.test(c.itemSheetHTML('window', 0)));
});

test('every door, the main one too, gets Replace, Remove, Cancel; the next door becomes the front', () => {
  const c = setup();
  assert.equal(c.itemSheetName('door', 0), "Double door 6\u00d76'4\" \u00b7 Siding color (" + c.sn + ") \u00b7 " + c.trimDisplayName() + " trim on Front wall");
  assert.match(c.itemSheetName('door', 1), /^Door 3\u00d76'4" \u00b7 .* on Back wall$/);
  const h = c.itemSheetHTML('door', 0);
  assert.deepEqual(buttons(h), ['Replace', 'Remove', 'Cancel']);
  assert.ok(!/can't|cannot|not removed|main door/i.test(h));
  assert.ok(c.doorEditHTML(0).includes('Remove this door'));
  const main = c.doorsData[0];
  // window on the left wall reads "Left" while the front door leads
  assert.equal(c.wallRelName('left'), 'Left');
  assert.equal(c.deleteItem('door', 0), true);
  assert.equal(c.doorsData.length, 1);
  assert.equal(c.doorFrontWall(), 'back', 'the remaining door becomes the front');
  assert.equal(c.wallRelName('back'), 'Front');
  assert.equal(c.wallRelName('left'), 'Right', 'labels follow the new front');
  assert.match(c.itemSheetName('door', 0), /^Door 3\u00d76'4" \u00b7 .* on Front wall$/);
  c.undoDelete();
  assert.equal(c.doorsData[0], main, 'Undo restores it as the main door');
  assert.equal(c.doorFrontWall(), 'front');
  assert.equal(c.wallRelName('left'), 'Left');
  // no doors at all: fall back to the shed's own front
  c.deleteItem('door', 1); c.deleteItem('door', 0);
  assert.equal(c.doorsData.length, 0);
  assert.equal(c.doorFrontWall(), 'front');
  assert.equal(c.wallLabelFor('left'), 'Left wall');
  assert.doesNotThrow(() => c.buildShed());
});

test('vents, shelves and porch lights get the same sheet; a vent has Change color instead of Replace', () => {
  const c = setup();
  c.ventsData.length = 0; c.ventsData.push({ wall: 'front', pos: 0.5 });
  c.shelvesData.length = 0; c.shelvesData.push({ wall: 'back', pos: 0.5, len: 8, depth: 16, cy: 48 });
  c.porchLightsData.length = 0; c.porchLightsData.push({ wall: 'front', pos: 0.3, style: c.PORCH_LIGHT_CATALOG[0].key });
  assert.match(c.itemSheetName('vent', 0), /^Vent \d+\u00d7\d+ \u00b7 (Black|White) on Front wall$/);
  assert.deepEqual(buttons(c.itemSheetHTML('vent', 0)), ['Change color', 'Remove', 'Cancel']);
  assert.match(c.itemSheetName('shelf', 0), /^Shelf 8 ft \u00d7 16" deep on Back wall$/);
  assert.deepEqual(buttons(c.itemSheetHTML('shelf', 0)), ['Replace', 'Remove', 'Cancel']);
  assert.equal(c.itemSheetName('plight', 0), 'Porch light Modern Cylinder \u00b7 Matte black on Front wall');
  assert.deepEqual(buttons(c.itemSheetHTML('plight', 0)), ['Replace', 'Remove', 'Cancel']);
  for (const [k, list] of [['vent', c.ventsData], ['shelf', c.shelvesData], ['plight', c.porchLightsData]]) {
    const it = list[0];
    assert.equal(c.deleteItem(k, 0), true, k); assert.equal(list.length, 0, k);
    c.undoDelete(); assert.equal(list[0], it, k + ' undo');
  }
});

test('Remove takes it off, and Undo puts the same item back at the same place', () => {
  const c = setup();
  const w0 = c.windowsData[0], before = JSON.stringify(c.windowsData);
  assert.equal(c.deleteItem('window', 0), true);
  assert.equal(c.windowsData.length, 1);
  assert.equal(c.windowsData[0].wall, 'right');
  c.undoDelete();
  assert.equal(c.windowsData[0], w0);
  assert.equal(JSON.stringify(c.windowsData), before);
  const d1 = c.doorsData[1];
  c.deleteItem('door', 1); assert.equal(c.doorsData.length, 1);
  c.undoDelete(); assert.equal(c.doorsData[1], d1);
  c.undoDelete(); assert.equal(c.doorsData.length, 2, 'a second Undo does nothing');
});

test('Replace selects the item on its own wall so the swap happens in place', () => {
  const c = setup();
  c.ADD_WALL = 'front';
  c.openItemSheet('window', 1);
  c.itemSheetReplace();
  assert.equal(c.selectedKind, 'window'); assert.equal(c.selectedWindow, 1);
  assert.equal(c.ADD_WALL, 'right');
  const pos = c.windowsData[1].pos, alt = c.WINDOW_CATALOG.find((e) => e.key !== c.windowsData[1].type && !/Transom/.test(e.key));
  c.addWindowByKey(alt.key);
  assert.equal(c.windowsData.length, 2);
  assert.equal(c.windowsData[1].type, alt.key);
  assert.equal(c.windowsData[1].pos, pos);
});

test('vent colour: each vent can carry its own; without one it follows the shed-wide Black/White', () => {
  const c = setup();
  c.ventsData.length = 0;
  c.ventsData.push({ wall: 'front', pos: 0.5 }); c.ventsData.push({ wall: 'back', pos: 0.5 });
  c.VENT_COLOR = 'black';
  assert.equal(c.ventColorKey(c.ventsData[0]), 'black');
  assert.deepEqual(buttons(c.ventColorPageHTML(0)), ['Black', 'White', 'Done']);
  c.setVentColorIdx(0, 'white');
  assert.equal(c.ventsData[0].color, 'white');
  c.setVentColorIdx(0, 'siding'); assert.equal(c.ventsData[0].color, 'white', 'match siding is gone');
  assert.equal(c.ventsData[1].color, undefined, 'only that vent');
  c.setVentColorIdx(0, 'purple'); assert.equal(c.ventsData[0].color, 'white', 'unknown colour ignored');
  // built louvre uses siding colour on vent 0, black on vent 1
  const louvHex = (i) => { const m = c.ventMeshes.find((x) => x.index === i); let hx = null;
    m.group.traverse((o) => { if (o.isMesh && o.geometry.parameters && Math.abs(o.geometry.parameters.depth - 0.012) < 1e-9) hx = o.material.color.getHex(); }); return hx; };
  assert.equal(louvHex(0), 0xf5f5f2);
  assert.equal(louvHex(1), 0x333333);
  // saved and reopened
  const cfg = JSON.parse(JSON.stringify(c.getDesignConfig()));
  assert.equal(cfg.vents[0].color, 'white');
  c.applyDesignConfig(cfg);
  assert.equal(c.ventsData[0].color, 'white');
  assert.equal(c.ventColorKey(c.ventsData[1]), 'black');
});

test('a design saved before per-vent colour opens unchanged (shed-wide White still applies)', () => {
  const c = setup();
  const cfg = JSON.parse(JSON.stringify(c.getDesignConfig()));
  cfg.vents = [{ wall: 'front', pos: 0.5, cy: null }]; cfg.ventColor = 'white';
  c.applyDesignConfig(cfg);
  assert.equal(c.ventsData[0].color, undefined);
  assert.equal(c.ventColorKey(c.ventsData[0]), 'white');
});

test('a vent saved with the dropped Match trim / Match siding follows the shed-wide colour', () => {
  const c = setup();
  c.VENT_COLOR = 'white';
  assert.equal(c.ventColorKey({ wall: 'front', pos: 0.5, color: 'siding' }), 'white');
  assert.equal(c.ventColorKey({ wall: 'front', pos: 0.5, color: 'trim' }), 'white');
});

test('size and colour everywhere: list rows, review sheet and the submitted item lines', () => {
  const c = setup();
  const nodes = {}; const orig = c.document.getElementById;
  c.document.getElementById = (id) => (nodes[id] = nodes[id] || orig.call(c.document, id));
  c.ventsData.length = 0; c.ventsData.push({ wall: 'front', pos: 0.5, color: 'black' });
  c.porchLightsData.length = 0; c.porchLightsData.push({ wall: 'front', pos: 0.3, style: 'modern' });
  c.renderPlacedWindows(); c.renderPlacedDoors();
  const wl = String(nodes.placedWindows.innerHTML), dl = String(nodes.placedDoors.innerHTML);
  assert.match(wl, /Transom window 12\u00d724 \u00b7 White frame \u00b7 [^<]+ trim &middot; Left wall/);
  assert.match(wl, /Vent 16\u00d78 \u00b7 Black &middot; Front wall/);
  assert.match(dl, /Double door 6\u00d76'4" \u00b7 Siding color/);
  // door with its own factory colour
  c.doorsData.push({ wall: 'right', pos: 0.5, style: 'res6B', w: 36, h: 82.5 });
  assert.match(c.itemSpec('door', c.doorsData[2]).text, /^Door 3\u00d76'8" \u00b7 Black \u00b7 /);
  c.doorsData.push({ wall: 'right', pos: 0.2, style: 'rollup', w: 96, h: 84, color: 'brown' });
  assert.equal(c.itemSpec('door', c.doorsData[3]).text, "Roll-up door 8\u00d77 \u00b7 Brown");
  // review sheet
  c.buildShed = () => {};
  const vm = await_import_vm();
  vm.runInContext(DU_SRC, c, { filename: 'designer-upgrade.js' });
  const row = (k) => (c.DU.specRows().find((r) => r[0] === k) || [])[1];
  assert.match(row('Windows'), /^2\u00d7 Transom window 12\u00d724 \u00b7 White frame/);
  assert.equal(row('Vents'), 'Vent 16\u00d78 \u00b7 Black');
  assert.match(row('Doors'), /Double door 6\u00d76'4" \u00b7 Siding color/);
  // submitted item lines
  const lines = JSON.parse(JSON.stringify(c.itemSpecLines()));
  assert.equal(lines.length, 4 + 2 + 1 + 1);
  const v = lines.find((x) => x.kind === 'vent');
  assert.deepEqual(v, { kind: 'vent', size: '16\u00d78', color: 'Black', wall: 'front', wallName: 'Front', text: 'Vent 16\u00d78 \u00b7 Black' });
  // config itself is untouched by this
  assert.equal(c.getDesignConfig().itemSpecs, undefined);
});

// ---- Duplicate (windows only) ----
function clearOf(c, wall, idx) {
  // the window at idx overlaps no other opening at its height, and sits off the corners
  const lenIn = ((wall === 'front' || wall === 'back') ? c.W : c.L) * 12;
  const me = c.windowsData[idx], fMe = c.openingFootprint(me.w, 'w');
  const ctr = me.pos * lenIn;
  assert.ok(ctr - fMe / 2 >= 3 - 1e-6 && ctr + fMe / 2 <= lenIn - 3 + 1e-6, 'off the corners');
  for (const o of c.wallOpenings(wall)) {
    if (o.kind === 'w' && o.i === idx) continue;
    if (!c.vOverlap({ kind: 'w', h: me.h, cy: me.cy }, o)) continue;
    const gapIn = Math.abs(o.pos * lenIn - ctr) - (c.openingFootprint(o.w, o.kind) + fMe) / 2;
    assert.ok(gapIn >= 2 - 1e-6, 'clear of ' + o.what + ' by ' + gapIn.toFixed(2) + 'in');
  }
}

test('only the window sheet has Duplicate; doors, vents, shelves, porch lights unchanged', () => {
  const c = setup();
  c.ventsData.length = 0; c.ventsData.push({ wall: 'front', pos: 0.5 });
  c.shelvesData.length = 0; c.shelvesData.push({ wall: 'back', pos: 0.5, len: 8, depth: 16, cy: 48 });
  c.porchLightsData.length = 0; c.porchLightsData.push({ wall: 'front', pos: 0.3, style: 'modern' });
  assert.deepEqual(buttons(c.itemSheetHTML('door', 0)), ['Replace', 'Remove', 'Cancel']);
  assert.deepEqual(buttons(c.itemSheetHTML('vent', 0)), ['Change color', 'Remove', 'Cancel']);
  assert.deepEqual(buttons(c.itemSheetHTML('shelf', 0)), ['Replace', 'Remove', 'Cancel']);
  assert.deepEqual(buttons(c.itemSheetHTML('plight', 0)), ['Replace', 'Remove', 'Cancel']);
});

test('Duplicate: an identical window next to the original on the same wall, clear of everything', () => {
  const c = setup();
  const e = c.WINDOW_CATALOG.find((x) => x.key === 'Black Vinyl 24x36');
  // extra fields stand in for anything else on the window: all of it is copied
  c.windowsData[0] = { wall: 'left', pos: 0.5, type: e.key, w: e.w, h: e.h, cy: 50, open: true, fold: 'right', ledge: true, grids: 'colonial' };
  c.buildShed();
  const src = JSON.parse(JSON.stringify(c.windowsData[0]));
  assert.equal(c.duplicateWindowIdx(0), true);
  assert.equal(c.windowsData.length, 3);
  const cp = c.windowsData[2];
  const strip = (o) => { const x = JSON.parse(JSON.stringify(o)); delete x.pos; return x; };
  assert.equal(JSON.stringify(strip(cp)), JSON.stringify(strip(src)), 'same type, size, height and every other field');
  assert.equal(cp.wall, 'left');
  assert.notEqual(cp.pos, src.pos);
  clearOf(c, 'left', 2);
  // nearest free spot: the copy sits right beside the original (2" casing gap)
  const lenIn = c.L * 12, f = c.openingFootprint(e.w, 'w');
  assert.ok(Math.abs(Math.abs(cp.pos - src.pos) * lenIn - (f + 2)) < 0.01, 'right next to it');
  assert.equal(c.selectedWindow, 2, 'the copy is selected');
});

test('Duplicate: full wall goes to another wall; no room anywhere changes nothing', () => {
  const c = setup();
  let n = 0;
  while (c.windowsData.filter((w) => w.wall === 'left').length && n++ < 200) {
    const before = c.windowsData.length;
    c.duplicateWindowIdx(0);
    if (c.windowsData[c.windowsData.length - 1].wall !== 'left' || c.windowsData.length === before) break;
  }
  const last = c.windowsData[c.windowsData.length - 1];
  assert.notEqual(last.wall, 'left', 'once the left wall is full, the copy lands elsewhere');
  c.windowsData.forEach((w, i) => clearOf(c, w.wall, i));
  // fill everything
  while (n++ < 400 && c.duplicateWindowIdx(0)) {}
  const t = { textContent: '', style: {} }; const orig = c.document.getElementById;
  c.document.getElementById = (id) => (id === 'toast' ? t : orig.call(c.document, id));
  const snap = JSON.stringify(c.windowsData);
  assert.equal(c.duplicateWindowIdx(0), false);
  assert.equal(JSON.stringify(c.windowsData), snap, 'nothing changed');
  assert.equal(t.textContent, 'No room for another window.');
  c.windowsData.forEach((w, i) => clearOf(c, w.wall, i));
});

test('a duplicated window is saved, listed and reviewed like any added window', () => {
  const c = setup();
  c.duplicateWindowIdx(0);
  const cfg = JSON.parse(JSON.stringify(c.getDesignConfig()));
  assert.equal(cfg.windows.length, 3);
  assert.equal(cfg.windows[2].type, cfg.windows[0].type);
  const nodes = {}; const orig = c.document.getElementById;
  c.document.getElementById = (id) => (nodes[id] = nodes[id] || orig.call(c.document, id));
  c.renderPlacedWindows();
  assert.equal((String(nodes.placedWindows.innerHTML).match(/Transom window 12\u00d724 \u00b7 White frame/g) || []).length, 3);
  c.buildShed = () => {};
  vmMod.runInContext(DU_SRC, c, { filename: 'designer-upgrade.js' });
  assert.match(c.DU.specRows().find((r) => r[0] === 'Windows')[1], /^3\u00d7 Transom window 12\u00d724 \u00b7 White frame/);
  assert.equal(c.itemSpecLines().filter((x) => x.kind === 'window').length, 3);
});
