/* PARTIAL PORCHES (R1) AND THE DORMER SLIDER.
 *
 * A partial porch is a notch out of the full enclosure, under the main roof:
 * the outer wall is open across the porch's run, a stepped-in wall carries
 * the openings, a ceiling closes it at the wall top, posts stand at the free
 * corners and never in front of a door. A porch as long as its wall is the
 * old full porch, so saved designs are untouched.
 *
 * Rays, not numbers read back from the code that placed the meshes.
 *   node --test tests/geometry/porchpartial.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

function build(cfg, doors) {
  Object.assign(c, { STYLE:'gable', W:10, L:20, H:8, PITCH:6, OVTYPE:'all4', OVH:4,
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, PORCH_LOC:'none', SIDE_PORCH:0,
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0 }, cfg);
  c.doorsData.length = 0; (doors || []).forEach(d => c.doorsData.push(Object.assign({}, d)));
  c.windowsData.length = 0;
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh && x.visible !== false) o.push(x); });
  return o;
}
function firstHit(meshes, from, dir) {
  const rc = new T.Raycaster(new T.Vector3(...from), new T.Vector3(...dir).normalize());
  const h = rc.intersectObjects(meshes, false);
  return h.length ? h[0] : null;
}
const SIDE4 = { PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:8 };
const DOOR_R = { wall:'right', pos:0.5, style:'craftsman', w:36, h:76 };

test('4x4 side porch: the outer wall is open across the porch, the stepped-in wall closes it', () => {
  const m = build(SIDE4, [DOOR_R]);
  const r = c.porchRect();
  assert.ok(r && r.wall === 'right' && Math.abs((r.a1 - r.a0) - 0.8) < 1e-6, 'a 4ft run on the right wall');
  const y = 1.3;                                       // above the door head, below the wall top
  const zc = (r.z0 + r.z1) / 2;
  const inPorch = firstHit(m, [3, y, zc], [-1, 0, 0]);
  assert.ok(inPorch, 'something closes the porch');
  assert.ok(inPorch.point.x < r.x0 + 0.08, `ray reached the inset wall (hit at x=${inPorch.point.x.toFixed(3)}, inset at ${r.x0})`);
  const outside = firstHit(m, [3, y, r.z1 + 0.6], [-1, 0, 0]);
  assert.ok(outside.point.x > 0.95, 'beside the porch the wall is where it always was');
});

test('the porch ceiling closes at the wall top', () => {
  const m = build(SIDE4, [DOOR_R]);
  const r = c.porchRect();
  for (const fx of [0.2, 0.5, 0.8]) for (const fz of [0.2, 0.5, 0.8]) {
    const x = r.x0 + (r.x1 - r.x0) * fx, z = r.z0 + (r.z1 - r.z0) * fz;
    const h = firstHit(m, [x, 0.5, z], [0, 1, 0]);
    assert.ok(h && h.point.y < 8 * 0.2 + 0.3, `closed overhead at (${x.toFixed(2)}, ${z.toFixed(2)})`);
  }
});

test('the enclosed size loses depth × length, the footprint stays', () => {
  build(SIDE4);
  assert.equal(c.enclosedSqft(), 200 - 16);
  assert.ok(c.porchIsPartial() && !c.porchIsFull());
  build({ PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:0 });
  assert.ok(!c.porchIsPartial(), 'length 0 is the full porch');
  assert.equal(c.enclosedSqft(), 200 - 80);
});

test('a door in the porch hangs on the stepped-in wall', () => {
  build(SIDE4, [DOOR_R]);
  const f = c.wallFrame('right'), r = c.porchRect();
  const ax = c.posToAxis('right', 0.5, 36);
  assert.ok(Math.abs(c.porchFixedAt(f, 'right', ax) - r.x0) < 1e-6);
  const away = c.posToAxis('right', 0.05, 36);
  assert.equal(c.porchFixedAt(f, 'right', away), f.fixed);
});

test('the door follows the porch when it slides, and that is not a "moved" warning', () => {
  build(SIDE4, [DOOR_R]);
  const before = c.porchRect();
  c.PORCH_OFF = 12;
  const after = c.porchRect();
  const moved = c.porchFitOpenings({ wall:'right', from:[before.a0, before.a1], shift: after.a0 - before.a0 });
  assert.equal(moved, 0);
  const ax = c.posToAxis('right', c.doorsData[0].pos, 36);
  assert.ok(ax > after.a0 && ax < after.a1, 'the door is still inside the porch');
});

test('a door elsewhere on the wall is pulled into a new porch; windows on the step slide clear', () => {
  build({ PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 }, [DOOR_R]);
  c.windowsData.push({ wall:'right', pos:0.22, w:24, h:36, cy:58 });   // straddles the step
  c.porchFitOpenings();
  const r = c.porchRect(), g = c.porchWallGaps().right;
  const d = c.posToAxis('right', c.doorsData[0].pos, 36);
  assert.ok(d > r.a0 && d < r.a1, 'door pulled into the porch');
  const wc = c.posToAxis('right', c.windowsData[0].pos, 24), wh = 0.2 + 0.07;
  assert.ok(wc - wh >= g[1] || wc + wh <= g[0], 'window clear of the step');
});

test('posts: none mid-wall, one at an open shed corner (Nando, 9 Oct)', () => {
  const posts = (m) => m.filter(x => x.geometry.type === 'BoxGeometry' && x.geometry.parameters &&
    Math.abs(x.geometry.parameters.width - 0.06) < 1e-6 && Math.abs(x.geometry.parameters.depth - 0.06) < 1e-6 &&
    x.geometry.parameters.height > 1.2 && x.position.x > 0.9 && x.position.x < 1.0);
  assert.equal(posts(build(SIDE4)).length, 0, 'mid-wall: the return walls carry the header');
  const atCorner = posts(build({ PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 }));
  assert.equal(atCorner.length, 1);
  assert.ok(atCorner[0].position.z < -1.9, 'the open back-right corner has its post');
});

test('no middle post lands in front of a door (the Estate Porch)', () => {
  const w = 16 * 0.2;
  Object.assign(c, { W:16, L:24 });
  c.doorsData.length = 0; c.doorsData.push({ wall:'front', pos:0.5, style:'resfull', w:36, h:82.5 });
  const seats = c.porchPostSeats(-(w/2)+0.05, (w/2)-0.05, true, true, (w-0.1)/2+1e-3, 'front');
  const dc = c.posToAxis('front', 0.5, 36), hw = 0.3 + 0.07;
  assert.ok(seats.length >= 3);
  seats.forEach(t => assert.ok(Math.abs(t - dc) >= hw, `post at ${t.toFixed(2)} clears the door`));
  const mids = seats.slice(2);
  assert.ok(Math.abs(mids.reduce((a, b) => a + b, 0)) < 1e-6, 'and the middle posts stay symmetric');
});

test('a saved design with no porch length loads as the full porch it always was', () => {
  build({});
  c.PORCH_LEN = 6; c.PORCH_OFF = 3;                     // stale state from a previous design
  c.applyDesignConfig({ style:'gable', w:10, l:20, h:8, porchLoc:'side', porchDepth:4 });
  assert.equal(c.PORCH_LEN, 0); assert.equal(c.PORCH_OFF, 0);
  assert.ok(c.porchIsFull());
  c.applyDesignConfig({ style:'gable', w:10, l:20, h:8, porchLoc:'side', porchDepth:4, porchLen:4, porchOff:8 });
  const cfg = c.getDesignConfig();
  assert.equal(cfg.porchLen, 4); assert.equal(cfg.porchOff, 8);
});

test('the dormer slides along the roof and stays inside the room', () => {
  // highest point over the right roof face, sampled along the length
  function dormerCentreZ(m) {
    const zs = [];
    for (let z = -1.6; z <= 1.6; z += 0.02) {
      const h = firstHit(m, [0.45, 5, z], [0, -1, 0]);
      if (h && h.point.y > 2.4) zs.push(z);   // the main roof here is ~2.27
    }
    return zs.length ? (zs[0] + zs[zs.length - 1]) / 2 : NaN;
  }
  const base = { W:12, L:16, PITCH:8, DORMER_R:6 };
  const z0 = dormerCentreZ(build(base));
  const z4 = dormerCentreZ(build({ ...base, DORMER_R_OFF:4 }));
  assert.ok(Math.abs(z0) < 0.1, `centred (${z0})`);
  assert.ok(Math.abs((z4 - z0) - 0.8) < 0.1, `slid 4ft toward the front (${(z4 - z0).toFixed(3)})`);
  Object.assign(c, { L:16, DORMER_R:6, DORMER_R_OFF:99 });
  assert.equal(c.dormerOffFt(1), (16 - 6) / 2 - 0.5);
});
