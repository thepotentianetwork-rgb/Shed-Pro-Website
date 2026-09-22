/* A REAL CUSTOMER'S SAVED DESIGN, WITH THE BUG IN IT.
 *
 * Design 027f6936, pulled from the live worker and committed here as a
 * fixture. It holds four shelf records — three byte-identical on the back
 * wall — and two byte-identical vents. The customer could see two shelves and
 * one vent. The pricer counted four and two, and quoted $330 of shelving and
 * venting that is not on the shed.
 *
 * Saved designs cannot be repaired in place: handleSaveDesign only ever
 * INSERTs under a fresh code, so that row keeps its duplicates forever. The
 * repair has to happen when the design is LOADED, which is what this covers.
 *
 * Run: node --test tests/ui/savedstacks.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDesigner, meshes } from '../harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAVED = JSON.parse(readFileSync(join(HERE, '..', 'design-027f6936.json'), 'utf8')).config;

test('the fixture really does contain the bug', () => {
  /* If this ever fails, the fixture was cleaned up and the tests below stopped
     proving anything. */
  assert.equal(SAVED.shelves.length, 4, 'four shelf records as saved');
  assert.equal(SAVED.vents.length, 2, 'two vent records as saved');
  const k = (o, ks) => ks.map((f) => o[f]).join('|');
  assert.equal(new Set(SAVED.shelves.map((s) => k(s, ['wall','pos','cy','depth','len']))).size, 2,
    'only two of the four are distinct');
  assert.equal(new Set(SAVED.vents.map((v) => k(v, ['wall','pos','cy']))).size, 1,
    'and both vents are the same vent');
});

function opened() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.renderer = { setClearColor(){}, toneMappingExposure: 1 };
  c.shedLights = [];
  c.__stubLights();
  /* Only the restore lines matter here, and applyDesignConfig drags in most of
     the page. Exercise dropStacked the way applyDesignConfig calls it. */
  c.ventsData  = c.dropStacked(SAVED.vents,  ['wall','pos','cy']);
  c.shelvesData = c.dropStacked(SAVED.shelves, ['wall','pos','cy','depth','len']);
  return c;
}

test('opening it leaves the customer with what they could actually see', () => {
  const c = opened();
  assert.equal(c.shelvesData.length, 2, 'two shelves, not four');
  assert.equal(c.ventsData.length, 1, 'one vent, not two');
});

test('it keeps the ones the customer placed, not a rebuilt guess', () => {
  const c = opened();
  // first of each set survives, with its own coordinates intact
  assert.deepEqual({ ...c.shelvesData[0] }, { ...SAVED.shelves[0] });
  assert.deepEqual({ ...c.shelvesData[1] }, { ...SAVED.shelves[3] }, 'the left-wall shelf is kept');
  assert.deepEqual({ ...c.ventsData[0] }, { ...SAVED.vents[0] });
});

test('a design with no duplicates is returned untouched', () => {
  /* The risk in a de-duplicator is that it eats something legitimate. Two
     shelves an inch apart are a choice, however odd. */
  const { c } = loadDesigner();
  const near = [
    { wall:'back', pos:0.5, cy:48, depth:16, len:10 },
    { wall:'back', pos:0.5, cy:49, depth:16, len:10 },
    { wall:'back', pos:0.4, cy:48, depth:16, len:10 },
    { wall:'left', pos:0.5, cy:48, depth:16, len:10 },
  ];
  assert.equal(c.dropStacked(near, ['wall','pos','cy','depth','len']).length, 4,
    'nothing that differs in any field is dropped');
});

test('and every shelf that survives is one you can see', () => {
  const c = opened();
  Object.assign(c, { STYLE:SAVED.style, W:SAVED.w, L:SAVED.l, H:SAVED.h, PITCH:SAVED.pitch,
    OVTYPE:SAVED.ovType, OVH:SAVED.ovh, ROOFTYPE:SAVED.roofType, SIDING:SAVED.siding,
    INSIDE_VIEW:false, PORCH_LOC:'none', SIDE_PORCH:0, FOUNDATION:SAVED.foundation,
    EDIT_MODE:false, selectedKind:'', windowsData:[], doorsData:SAVED.doors,
    porchLightsData:[], ADDONS:SAVED.addons, ELEC:'none' });
  c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const parts = meshes(c).filter((x) => {
    let p = x.obj; while (p) { if (p.userData && p.userData.isShelf) return true; p = p.parent; } return false;
  });
  const boxes = new Set(parts.map((v) =>
    [v.min.x, v.min.y, v.min.z, v.max.x, v.max.y, v.max.z].map((n) => n.toFixed(4)).join(',')));
  assert.equal(boxes.size, c.shelvesData.length * 3, 'no shelf is hidden inside another');
});
