/* NOTHING MAY BE ADDED ON TOP OF SOMETHING ELSE.
 *
 * Found on a real customer's quote: four shelves billed, two on the shed.
 * addShelf pushed {wall:'back', pos:0.5, cy:48} every time — no stagger, no
 * check — so four taps made four records at one coordinate and three boards
 * were hidden inside the first. The 3D drew what it was given and so did the
 * invoice. At $15/ft on a 12ft wall that is $360 of shelving nobody could see.
 *
 * Vents had it too, and vents are priced per unit off ventsData.length, so two
 * at pos 0.5 on one gable is one vent on the shed and two on the bill. Porch
 * lights had it as well; they are not priced today.
 *
 * Windows never did: addWindow finds an open slot, re-spaces the wall if it
 * must, and refuses rather than stack. These tests hold the other three to it.
 *
 * The check is the one that matters commercially: EVERY RECORD THE PRICER
 * COUNTS MUST BE A THING THE CUSTOMER CAN SEE.
 *
 * Run: node --test tests/ui/stacking.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

function fresh() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'', ADD_WALL:'front',
    windowsData:[], ventsData:[], shelvesData:[], doorsData:[], porchLightsData:[], ADDONS:{},
    showToast(){}, toggleEditMode(){}, syncEditorPanel(){}, refreshInterior(){}, closeSubPage(){},
    renderPlacedWindows(){}, renderPlacedVents(){}, renderPlacedShelves(){} });
  c.__stubLights();
  return c;
}

const partsOf = (c, flag) => meshes(c).filter(x => {
  let p = x.obj; while (p) { if (p.userData && p.userData[flag]) return true; p = p.parent; } return false;
});
const distinctBoxes = (parts) => new Set(parts.map(v =>
  [v.min.x, v.min.y, v.min.z, v.max.x, v.max.y, v.max.z].map(n => n.toFixed(4)).join(','))).size;

test('four taps of Add Shelf make four shelves you can see', () => {
  const c = fresh();
  for (let i = 0; i < 4; i++) c.addShelf();
  assert.equal(c.shelvesData.length, 4, 'four records');
  const cys = c.shelvesData.map(s => s.cy).sort((a, b) => a - b);
  for (let i = 1; i < cys.length; i++) {
    assert.ok(cys[i] - cys[i - 1] >= 13.9,
      `shelves ${cys[i-1]}in and ${cys[i]}in apart — they would overlap`);
  }
  c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const parts = partsOf(c, 'isShelf');
  assert.ok(parts.length, 'shelves were drawn');
  // three meshes per shelf: the board and two brackets
  assert.equal(distinctBoxes(parts), c.shelvesData.length * 3,
    'every shelf record occupies its own space');
});

test('a shelf is refused rather than hidden when the wall is full', () => {
  /* The important half. Staggering that silently gives up and stacks is the
     same bug with extra steps: what must never happen is a priced record with
     nothing visible behind it. */
  const c = fresh();
  let added = 0;
  for (let i = 0; i < 40; i++) { const n = c.shelvesData.length; c.addShelf(); if (c.shelvesData.length > n) added++; }
  assert.ok(added < 40, 'it stops adding at some point rather than stacking forever');
  const key = (s) => `${s.wall}|${s.cy}`;
  assert.equal(new Set(c.shelvesData.map(key)).size, c.shelvesData.length,
    'no two shelves share a wall and a height');
});

test('vents do not stack, because vents are billed per unit', () => {
  const c = fresh();
  for (let i = 0; i < 3; i++) c.addVent();
  assert.equal(c.ventsData.length, 3);
  const onWall = c.ventsData.filter(v => v.wall === c.ventsData[0].wall).map(v => v.pos).sort((a, b) => a - b);
  for (let i = 1; i < onWall.length; i++) {
    assert.ok(onWall[i] - onWall[i - 1] >= 0.17,
      `two vents at ${onWall[i-1]} and ${onWall[i]} on one wall would overlap`);
  }
  c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const parts = partsOf(c, 'isVent');
  if (parts.length) {
    const xs = new Set(parts.map(v => ((v.min.x + v.max.x) / 2).toFixed(3)));
    assert.ok(xs.size >= 3, `three vents sit at ${xs.size} distinct positions`);
  }
});

test('porch lights do not stack either', () => {
  const c = fresh();
  const before = c.porchLightsData.length;
  for (let i = 0; i < 3; i++) { if (typeof c.addPorchLight === 'function') c.addPorchLight('front', 'barn'); }
  if (c.porchLightsData.length === before) return;      // not reachable in this build
  const pos = c.porchLightsData.map(p => p.pos).sort((a, b) => a - b);
  for (let i = 1; i < pos.length; i++) {
    assert.ok(pos[i] - pos[i - 1] >= 0.14, `lights at ${pos[i-1]} and ${pos[i]} overlap`);
  }
});
