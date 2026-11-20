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
  assert.deepEqual(buttons(c.itemSheetHTML('window', 0)), ['Replace', 'Remove', 'Cancel']);
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
