/* TAP A DOOR OR WINDOW -> REPLACE / MOVE / DELETE (preview, 19 Nov 2026).
 *   node --test tests/ui/itemsheet.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

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

test('a window sheet names it by wall (door wall = Front) and offers Replace, Move, Delete, Cancel', () => {
  const c = setup();
  assert.match(c.itemSheetName('window', 0), / on Left wall$/);
  assert.deepEqual(buttons(c.itemSheetHTML('window', 0)), ['Replace', 'Move', 'Delete', 'Cancel']);
});

test('the main door gets Replace and Move only, with the reason; a second door can be deleted', () => {
  const c = setup();
  const h = c.itemSheetHTML('door', 0);
  assert.deepEqual(buttons(h), ['Replace', 'Move', 'Cancel']);
  assert.match(h, /main door/);
  assert.equal(c.deleteItem('door', 0), false);
  assert.equal(c.doorsData.length, 2);
  assert.ok(!c.doorEditHTML(0).includes('Remove this door'));
  assert.deepEqual(buttons(c.itemSheetHTML('door', 1)), ['Replace', 'Move', 'Delete', 'Cancel']);
  assert.ok(c.doorEditHTML(1).includes('Remove this door'));
});

test('Delete removes it, and Undo puts the same item back at the same place', () => {
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
