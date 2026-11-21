/* SQUARE VENTS, EVEN SPACING (Nando, 20 Nov 2026: "Fix the vents and make
 * sure they look square even if they aren't in the gable that's okay just
 * make the spacing even").
 *
 *   1. The six louvre blades leave the same dark gap at the head, between
 *      every pair of blades, and over the sill.
 *   2. Every vent is a level, square frame: four casing boards of one width,
 *      no tilt, whatever the size or style.
 *   3. An auto-placed vent never fuses with the trim next to it: siding shows
 *      above and below its casing (belt board, eave frieze, door or window
 *      casing), in the gable or, when the gable has no room, on the wall.
 *   4. Squeezed between two trims, it is centred: the siding above and below
 *      match.
 *   5. Several auto vents on one gable end are spread with equal gaps at one
 *      height; a vent placed by hand is left exactly where it was put.
 *
 * Run: node --test tests/geometry/ventsquare.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
c.showToast = () => {};
const IN = 0.2 / 12;

function build(cfg) {
  Object.assign(c, { STYLE:'gable', W:10, L:12, H:8, PITCH:6, OVTYPE:'all4', OVH:4, PORCH_LOC:'none',
    SIDE_PORCH:0, SIDING:'vertical', ROOFTYPE:'shingle', INSIDE_VIEW:false, EDIT_MODE:false,
    selectedKind:'', selectedWindow:-1, selectedDoor:-1, selectedVent:-1, selectedShelf:-1, selectedPorchLight:-1,
    windowsData:[{wall:'right', pos:0.5, w:24, h:36, cy:58}],
    doorsData:[{wall:'front', pos:0.5, style:'basic', w:72, h:76}],
    ventsData:[{wall:'front', pos:0.5, cy:null}, {wall:'back', pos:0.5, cy:null}], shelvesData:[] }, cfg);
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
}
const allMeshes = () => { const o = []; c.shedGroup.traverse(x => { if (x.isMesh) o.push(x); }); return o; };

/* Probe the wall just outside a vent's casing. Returns how far the first
   surface hit stands proud of the vent group's own wall face (inches):
   ~0 is siding, ~1 is a trim board. */
function probe(vm) {
  const g = vm.group, objs = allMeshes();
  const q = g.getWorldQuaternion(new T.Quaternion());
  const n = new T.Vector3(0, 0, 1).applyQuaternion(q), u = new T.Vector3(1, 0, 0).applyQuaternion(q);
  const own = []; g.traverse(x => { if (x.isMesh) own.push(x); });
  const bx = new T.Box3(); own.forEach(m => bx.expandByObject(m));
  const ctr = bx.getCenter(new T.Vector3());
  const hw = Math.abs(u.x) > 0.5 ? (bx.max.x - bx.min.x) / 2 : (bx.max.z - bx.min.z) / 2;
  const hh = (bx.max.y - bx.min.y) / 2;
  const back = Math.abs(n.z) > 0.5 ? (n.z > 0 ? bx.min.z : -bx.max.z) : (n.x > 0 ? bx.min.x : -bx.max.x);
  const at = (du, dy) => {
    const p = ctr.clone().addScaledVector(u, du); p.y += dy;
    const o = p.clone().addScaledVector(n, 0.5);
    const r = new T.Raycaster(o, n.clone().negate(), 0, 2).intersectObjects(objs, false)[0];
    if (!r) return null;
    const along = Math.abs(n.z) > 0.5 ? r.point.z * Math.sign(n.z) : r.point.x * Math.sign(n.x);
    return (along - back) / IN;
  };
  return Object.assign(at, { hw, hh });
}
// Inches of bare siding between the casing edge and the next trim, walking out.
function revealOf(at, dirY) {
  let k = 0.125;
  for (; k <= 12; k += 0.125) {
    const d = at(0, dirY * (at.hh + k * IN));
    const dl = at(-at.hw * 0.9, dirY * (at.hh + k * IN)), dr = at(at.hw * 0.9, dirY * (at.hh + k * IN));
    if ([d, dl, dr].some(x => x == null || x > 0.4)) break;
  }
  return k - 0.125;
}

// ── 1. EVEN LOUVRE GAPS ──────────────────────────────────────────────────
test('the louvre blades are evenly spaced, head and sill gaps included', () => {
  const g = c.buildVentInsertGeo(c.VENT_W, c.VENT_H);
  const ih = c.VENT_H - 2 * c.VENT_LIP;
  const blades = g.blades, nose = g.nose;
  blades.computeBoundingBox(); nose.computeBoundingBox();
  // the merged geometry is n boxes in order: one band per blade, nosing added
  const n = c.VENT_BLADES, bands = [];
  for (let k = 0; k < n; k++) bands.push([Infinity, -Infinity]);
  for (const geo of [blades, nose]) {
    const a = geo.attributes.position.array, per = a.length / n;
    for (let i = 0; i < a.length; i += 3) {
      const b = bands[Math.floor(i / per)];
      b[0] = Math.min(b[0], a[i + 1]); b[1] = Math.max(b[1], a[i + 1]);
    }
  }
  assert.equal(bands.length, c.VENT_BLADES, `${bands.length} blade bands`);
  const gaps = [bands[0][0] + ih / 2];
  for (let i = 1; i < bands.length; i++) gaps.push(bands[i][0] - bands[i - 1][1]);
  gaps.push(ih / 2 - bands[bands.length - 1][1]);
  const lo = Math.min(...gaps), hi = Math.max(...gaps);
  assert.ok(lo > 0.003, `every gap opens (${(lo / IN).toFixed(2)}in)`);
  assert.ok(hi - lo < 1e-4, `equal gaps: ${gaps.map(x => (x / IN).toFixed(3)).join(', ')} in`);
});

// ── 2-4. SQUARE, CLEAR OF THE TRIM, EVENLY SPACED ─────────────────────────
const SIZES = [[4, 6, 36], [6, 8, 36], [8, 10, 72], [10, 12, 72], [12, 16, 72], [8, 12, 72]];
for (const STYLE of ['gable', 'barn']) for (const PITCH of [4, 6]) for (const [W, L, dw] of SIZES) {
  test(`gable-end vents are square and clear of the trim — ${STYLE} ${W}x${L}, ${PITCH}/12`, () => {
    build({ STYLE, W, L, PITCH, doorsData:[{wall:'front', pos:0.5, style:'basic', w:dw, h:76}] });
    assert.equal(c.ventMeshes.length, 2);
    for (const vm of c.ventMeshes) {
      const g = vm.group, vd = c.ventsData[vm.index];
      assert.ok(Math.abs(g.rotation.x) < 1e-9 && Math.abs(g.rotation.z) < 1e-9, 'not tilted');
      const cs = vd._caseIn;
      assert.ok(cs >= c.VENT_CASE_MIN_IN - 1e-9 && cs <= 3.3 + 1e-9, `casing ${cs}in`);
      // four boards, all the same width: square frame
      const boards = g.children.filter(m => m.isMesh && m.geometry.type === 'BoxGeometry' && !m.userData.ventPart);
      assert.equal(boards.length, 4, 'four casing boards');
      const widths = boards.map(b => Math.min(b.geometry.parameters.width, b.geometry.parameters.height));
      for (const w of widths) assert.ok(Math.abs(w - cs * IN) < 1e-9, `board ${(w / IN).toFixed(2)}in vs ${cs}in`);
      const at = probe(vm);
      const up = revealOf(at, 1), dn = revealOf(at, -1);
      assert.ok(up >= 0.5, `${vd.wall}: siding above the casing (${up}in)`);
      assert.ok(dn >= 0.5, `${vd.wall}: siding below the casing (${dn}in)`);
      if (cs < 3.3 - 1e-9 && vd.cy < c.H * 12) assert.ok(Math.abs(up - dn) <= 0.25, `squeezed, so centred: ${up} above vs ${dn} below`);
    }
  });
}

test('a side-wall vent clears the eave frieze and the window under it', () => {
  build({ ventsData:[{wall:'right', pos:0.5, cy:null}] });
  const vm = c.ventMeshes[0], vd = c.ventsData[0];
  assert.equal(vd._caseIn, c.ventCaseFullIn(), 'full casing');
  const at = probe(vm);
  assert.ok(revealOf(at, 1) >= 1, `siding under the frieze (${revealOf(at, 1)}in)`);
  assert.ok(revealOf(at, -1) >= 1, `siding over whatever is below (${revealOf(at, -1)}in)`);
});

// ── 5. SEVERAL VENTS, AND HAND-PLACED ONES ───────────────────────────────
for (const n of [2, 3]) test(`${n} auto vents on one gable end spread evenly at one height`, () => {
  build({ ventsData: Array.from({ length:n }, () => ({ wall:'front', pos:0.5, cy:null })) });
  const vs = c.ventMeshes.filter(v => v.group.userData.wall === 'front').map(v => {
    const b = new T.Box3().setFromObject(v.group); return { x0:b.min.x, x1:b.max.x, y:(b.min.y + b.max.y) / 2 };
  }).sort((a, b) => a.x0 - b.x0);
  assert.equal(vs.length, n);
  for (const v of vs) assert.ok(Math.abs(v.y - vs[0].y) < 1e-9, 'one height');
  const gaps = []; for (let i = 1; i < n; i++) gaps.push(vs[i].x0 - vs[i - 1].x1);
  for (const g of gaps) assert.ok(g > 0 && Math.abs(g - gaps[0]) < 1e-6, `equal gaps ${gaps.map(x => (x / IN).toFixed(2))}`);
  const mid = (vs[0].x0 + vs[n - 1].x1) / 2;
  assert.ok(Math.abs(mid) < 1e-6, 'the row is centred on the gable');
});

test('a vent placed by hand stays exactly where it was put', () => {
  build({ ventsData:[{wall:'front', pos:0.3, cy:100}] });
  assert.equal(c.ventsData[0].pos, 0.3);
  assert.equal(c.ventsData[0].cy, 100);
  assert.equal(c.ventsData[0]._caseIn, undefined);
});

test('the Add Vent button lands an auto-placed vent the same rules place', () => {
  build({ ventsData:[] });
  c.ADD_WALL = 'front'; c.addVent();
  c.EDIT_MODE = false; c.selectedKind = ''; c.selectedVent = -1;
  build({ ventsData: c.ventsData });
  const vd = c.ventsData[0];
  assert.ok(vd._autoCy, 'auto');
  assert.ok(vd.cy > c.H * 12, 'in the 10x12 gable');
  const at = probe(c.ventMeshes[0]);
  assert.ok(revealOf(at, -1) >= 1, 'with siding under its sill');
});
