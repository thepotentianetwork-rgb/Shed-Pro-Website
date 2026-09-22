/* THE RAMP HAS TO BE A RAMP.
 *
 * A shed on blocks stands 8.4in off the ground and a quad cannot climb a
 * threshold, so this is a slope you could ride up, not a step. The test that
 * matters is exactly that: walk a ray down the surface from the toe to the
 * doorway and check it climbs the whole way without a gap.
 *
 * It caught the thing that was wrong. The deck was rotated the wrong way, so
 * the ramp CLIMBED as it left the building — high end at the threshold, toe
 * hanging in mid air. In a wireframe that is a wedge either way up; measured,
 * it is obvious.
 *
 * Run: node --test tests/geometry/ramp.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const INCH = 0.2/12;
const DRIVE_IN = { wall:'front', pos:0.5, w:72, h:80, style:'rollup', color:'white' };

function build(cfg) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    windowsData:[], ventsData:[], shelvesData:[], ADDONS:{ ramp:true },
    doorsData:[Object.assign({}, DRIVE_IN)] }, cfg);
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return meshes(c);
}
const rampParts = (m) => m.filter(x => { let p=x.obj; while(p){ if(p.userData&&p.userData.isRamp) return true; p=p.parent; } return false; });
function rampCount(m) {
  const seen = new Set();
  for (const x of rampParts(m)) { let p=x.obj; while(p && !(p.userData&&p.userData.isRamp)) p=p.parent; seen.add(p); }
  return seen.size;
}
const bounds = (parts) => ({
  x0:Math.min(...parts.map(v=>v.min.x)), x1:Math.max(...parts.map(v=>v.max.x)),
  y0:Math.min(...parts.map(v=>v.min.y)), y1:Math.max(...parts.map(v=>v.max.y)),
  z0:Math.min(...parts.map(v=>v.min.z)), z1:Math.max(...parts.map(v=>v.max.z)) });
function objects() { const o=[]; c.shedGroup.traverse(x=>{ if(x.isMesh) o.push(x); }); return o; }

// ── IT CLIMBS ────────────────────────────────────────────────────────────

for (const FOUNDATION of ['blocks', 'gravel', 'pad', 'existing']) {
  test(`you can ride up it — ${FOUNDATION} foundation`, () => {
    const m = build({ FOUNDATION });
    const b = bounds(rampParts(m));
    const lift = c.shedGroup.position.y;
    const objs = objects();
    const topAt = (z) => {
      const rc = new T.Raycaster(new T.Vector3(0, 3, z), new T.Vector3(0,-1,0), 0, 20);
      const hit = rc.intersectObjects(objs, false).filter(v => v.point.y < lift + 0.5)[0];
      return hit ? hit.point.y : null;
    };
    const zWall = c.encLft()*0.2/2 + 0.025;
    /* The tread ribs stand proud of the deck, so a ray lands a few thou higher
       on a rib than between two. That is the tread doing its job, not a dip,
       so the check is that the surface never drops by MORE than a rib is
       tall — a real backwards ramp fails this by the full rise. */
    const TREAD = 0.01;
    let prev = null, fell = [];
    for (let z = b.z1 - 0.01; z > zWall + 0.02; z -= 0.02) {
      const y = topAt(z);
      assert.ok(y != null, `there is a surface at z=${z.toFixed(3)} — no hole in the ramp`);
      if (prev != null && y < prev - TREAD) fell.push(z.toFixed(3));
      prev = y;
    }
    assert.deepEqual(fell, [], `the surface only ever rises towards the door (fell at ${fell.join(', ')})`);
    const toe = topAt(b.z1 - 0.01);
    assert.ok(toe < lift * 0.35, `the far end is down at grade (${toe.toFixed(4)} vs floor ${lift.toFixed(4)})`);
    assert.ok(prev > lift * 0.8, `and the near end is up at the floor (${prev.toFixed(4)})`);
  });
}

test('the toe sits on the ground, not above it or buried in it', () => {
  const b = bounds(rampParts(build({})));
  assert.ok(b.y0 > -0.02 && b.y0 < 0.02, `toe within an inch of grade (${b.y0.toFixed(4)})`);
});

test('it runs out from the wall, not into the shed', () => {
  const m = build({});
  const b = bounds(rampParts(m));
  const zWall = c.encLft()*0.2/2 + 0.025;
  assert.ok(b.z0 > zWall - 0.02, `nothing inside the wall (${b.z0.toFixed(4)} vs ${zWall.toFixed(4)})`);
  const run = (b.z1 - b.z0) / 0.2;
  assert.ok(run > 1.5 && run < 6, `a sensible length: ${run.toFixed(2)} ft`);
});

test('it is about as wide as the door and centred on it', () => {
  const b = bounds(rampParts(build({})));
  const wIn = (b.x1 - b.x0) / INCH;
  assert.ok(wIn > 60 && wIn <= 72, `${wIn.toFixed(0)}in against a 72in door`);
  assert.ok(Math.abs((b.x0 + b.x1) / 2) < 1e-6, 'centred on the opening');
});

// ── IT GOES IN THE RIGHT PLACE ───────────────────────────────────────────

for (const wall of ['front', 'back', 'left', 'right']) {
  test(`it lands outside the ${wall} wall`, () => {
    const m = build({ doorsData:[Object.assign({}, DRIVE_IN, { wall })] });
    const b = bounds(rampParts(m));
    const f = c.wallFrame(wall);
    const outN = (f.ax === 'x') ? f.nz : f.nx;
    const out = (f.ax === 'x') ? [b.z0, b.z1] : [b.x0, b.x1];
    const beyond = outN > 0 ? (out[1] - f.fixed) : (f.fixed - out[0]);
    assert.ok(beyond > 0.3, `it projects away from the building (${(beyond/0.2).toFixed(2)} ft)`);
    const inside = outN > 0 ? (f.fixed - out[0]) : (out[1] - f.fixed);
    assert.ok(inside < 0.03, 'and does not push back through the wall');
  });
}

// ── WHICH DOOR, AND HOW MANY ─────────────────────────────────────────────

test('only the drive-in door gets one, not the walk door', () => {
  const m = build({ doorsData:[
    { wall:'front', pos:0.3, w:36, h:80, style:'cedar', color:'white' },
    { wall:'right', pos:0.5, w:96, h:84, style:'rollup', color:'brown' } ] });
  assert.equal(rampCount(m), 1);
  const b = bounds(rampParts(m));
  assert.ok(b.x0 > 0, 'it is on the right wall, where the roll-up is');
});

test('two drive-in doors still means one ramp, because it is one flat price', () => {
  // Building one at each would show a customer with two roll-ups two ramps for
  // the price of one. If that ever changes, the price has to go per-door too.
  const m = build({ doorsData:[
    { wall:'front', pos:0.3, w:72, h:80, style:'rollup', color:'white' },
    { wall:'right', pos:0.5, w:96, h:84, style:'rollup', color:'brown' } ] });
  assert.equal(rampCount(m), 1);
});

test('a shed with only a walk door still shows the ramp it paid for', () => {
  const m = build({ doorsData:[{ wall:'front', pos:0.5, w:36, h:80, style:'cedar', color:'white' }] });
  assert.equal(rampCount(m), 1, 'nothing on screen would read as broken');
});

test('no door, no ramp', () => {
  assert.equal(rampCount(build({ doorsData:[] })), 0);
});

test('switched off, nothing is built', () => {
  assert.equal(rampCount(build({ ADDONS:{} })), 0);
});

test('it does not appear in the dollhouse view', () => {
  // Inside view strips the shell; a ramp floating outside it is just clutter.
  assert.equal(rampCount(build({ INSIDE_VIEW:true })), 0);
});
