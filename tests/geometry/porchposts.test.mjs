/* PARTIAL PORCH POSTS — ONLY WHERE SOMETHING NEEDS HOLDING UP.
 *
 * Nando (9 Oct): "We only need a corner one if the porch is on the corner.
 * Anywhere else we don't need them unless it's a larger porch."
 *  - corner porch: one post, at the open outer corner; none where the porch
 *    meets the full-depth wall;
 *  - mid-wall porch: none;
 *  - a middle post only past the full porches' own middle-post span
 *    (11ft front, 13ft side), never in front of a door;
 *  - full-length porches: as they were.
 *   node --test tests/geometry/porchposts.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

function build(cfg, doors) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:8, PITCH:6, OVTYPE:'all4', OVH:4, SIDING:'vertical',
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_DECK:'pt',
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0, FOUNDATION:'blocks' }, cfg);
  c.doorsData.length = 0; (doors || []).forEach(d => c.doorsData.push(Object.assign({}, d)));
  c.windowsData.length = 0;
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh && x.visible !== false) o.push(x); });
  return o;
}
function posts(m) {
  return m.filter(o => { const p = o.geometry.parameters || {};
    return o.geometry.type === 'BoxGeometry' && Math.abs(p.width - 0.06) < 1e-6 && Math.abs(p.depth - 0.06) < 1e-6 && p.height > 1.0; })
    .map(o => ({ x: o.position.x, z: o.position.z }));
}
const along = (r, p) => r.wall === 'right' ? p.z : p.x;

test('mid-wall partial porches have no posts, front and side, 4 to the limit', () => {
  for (const len of [4, 6, 8, 11]) {
    assert.equal(posts(build({ PORCH_LOC:'front', SIDE_PORCH:4, W:14, PORCH_LEN:len, PORCH_OFF:1 })).length, 0, `front ${len}ft`);
  }
  for (const len of [4, 8, 13]) {
    assert.equal(posts(build({ PORCH_LOC:'side', SIDE_PORCH:4, L:20, PORCH_LEN:len, PORCH_OFF:2 })).length, 0, `side ${len}ft`);
  }
});

test('a corner porch has exactly one post, at the open outer corner', () => {
  const cases = [
    ['front, left',  { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 }, -1, 1],
    ['front, right', { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:8 },  1, 1],
    ['side, back',   { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 },  1, -1],
    ['side, front',  { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:16 }, 1, 1],
  ];
  for (const [name, cfg, sx, sz] of cases) {
    const p = posts(build(cfg));
    assert.equal(p.length, 1, name);
    const cx = sx * c.W * 0.2 / 2, cz = sz * c.L * 0.2 / 2;
    assert.ok(Math.abs(p[0].x - (cx - sx * 0.05)) < 1e-6 && Math.abs(p[0].z - (cz - sz * 0.05)) < 1e-6, `${name}: at the corner`);
  }
});

test('a middle post only past the full porches\' span: 11ft front, 13ft side', () => {
  // front: 11ft none, 12ft one
  assert.equal(posts(build({ PORCH_LOC:'front', SIDE_PORCH:4, W:16, PORCH_LEN:11, PORCH_OFF:2 })).length, 0);
  let m = build({ PORCH_LOC:'front', SIDE_PORCH:4, W:16, PORCH_LEN:12, PORCH_OFF:2 });
  let r = c.porchRect(), p = posts(m);
  assert.equal(p.length, 1, 'front 12ft mid-wall: one middle post');
  assert.ok(Math.abs(along(r, p[0]) - (r.a0 + r.a1) / 2) < 1e-6, 'centred');
  // side: 13ft none, 14ft one
  assert.equal(posts(build({ PORCH_LOC:'side', SIDE_PORCH:4, L:20, PORCH_LEN:13, PORCH_OFF:3 })).length, 0);
  m = build({ PORCH_LOC:'side', SIDE_PORCH:4, L:20, PORCH_LEN:14, PORCH_OFF:3 });
  assert.equal(posts(m).length, 1, 'side 14ft mid-wall: one middle post');
  // a long corner porch: the corner post and the middle one
  m = build({ PORCH_LOC:'side', SIDE_PORCH:4, L:20, PORCH_LEN:14, PORCH_OFF:0 });
  r = c.porchRect(); p = posts(m).map(q => along(r, q)).sort((a, b) => a - b);
  assert.equal(p.length, 2, 'side 14ft at the back corner: corner + middle');
  assert.ok(Math.abs(p[0] - (r.a0 + 0.05)) < 1e-6);
});

test('the middle post is moved off a door', () => {
  const m = build({ PORCH_LOC:'side', SIDE_PORCH:4, L:20, PORCH_LEN:14, PORCH_OFF:3 },
    [{ wall:'right', pos:0.5, style:'basic', w:60, h:76 }]);
  const dc = c.posToAxis('right', 0.5, 60), hw = 60 * 0.2 / 24 + 0.07;
  const p = posts(m);
  assert.ok(p.length >= 1);
  for (const q of p) assert.ok(q.z <= dc - hw || q.z >= dc + hw, `post at ${q.z.toFixed(2)} clear of the door`);
});

test('full-length porches keep their posts', () => {
  assert.equal(posts(build({ PORCH_LOC:'front', SIDE_PORCH:4, W:10 })).length, 2, 'front 10ft: two corners');
  assert.equal(posts(build({ PORCH_LOC:'front', SIDE_PORCH:4, W:12 })).length, 3, 'front 12ft: corners + middle');
  assert.equal(posts(build({ PORCH_LOC:'side', SIDE_PORCH:4, L:12 })).length, 2, 'side 12ft: two corners');
  assert.equal(posts(build({ PORCH_LOC:'side', SIDE_PORCH:4, L:16 })).length, 3, 'side 16ft: corners + middle');
});
