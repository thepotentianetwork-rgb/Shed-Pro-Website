/* PARTIAL PORCH: THE DECK AND THE CORNER POST.
 *
 * Nando, on a 4ft corner front porch: "The floor looks off and also use a
 * post like the other porches if the porch is in the corner."
 *  - Floor: on a slab the deck sat exactly on the slab's top (z-fighting
 *    board by board); boards ran front-to-back on a square porch; rim boards
 *    went on a front porch's three sides whatever the porch was.
 *  - Corner: the house's corner block and trim boards still stood at a corner
 *    the porch had cut away, a tall thin strip beside the porch post.
 *   node --test tests/geometry/porchpostfloor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const DECK = 0x8a765a;

function build(cfg, doors) {
  Object.assign(c, { STYLE:'gable', W:10, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:4, SIDING:'vertical',
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_DECK:'pt',
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0, FOUNDATION:'blocks' }, cfg);
  c.doorsData.length = 0; (doors || []).forEach(d => c.doorsData.push(Object.assign({}, d)));
  c.windowsData.length = 0;
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh && x.visible !== false) o.push(x); });
  return o;
}
const box = (o) => new T.Box3().setFromObject(o);
const isDeck = (o) => o.material && o.material.color && o.material.color.getHex() === DECK;
const lift = () => c.shedGroup.position.y;
function isPost(o) {
  const p = o.geometry.parameters || {};
  return o.geometry.type === 'BoxGeometry' && Math.abs(p.width - 0.06) < 1e-6 && Math.abs(p.depth - 0.06) < 1e-6 && p.height > 1.0;
}
const SIDE = (len, off) => ({ PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:len, PORCH_OFF:off });
const FRONT = (len, off) => ({ W:12, PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:len, PORCH_OFF:off });
const CASES = [
  ['side, back corner',  SIDE(4, 0)],  ['side, mid-wall', SIDE(4, 6)],  ['side, front corner', SIDE(4, 12)],
  ['front, left corner', FRONT(4, 0)], ['front, mid-wall', FRONT(4, 4)], ['front, right corner', FRONT(4, 8)],
];

test('deck boards run along the porch wall, like a full porch, and cover it edge to edge', () => {
  for (const [name, cfg] of CASES) for (const fnd of ['blocks', 'pad', 'existing']) {
    const m = build({ ...cfg, FOUNDATION:fnd });
    const r = c.porchRect(), side = r.wall === 'right';
    const boards = m.filter(o => isDeck(o) && (o.geometry.parameters.height || 0) < 0.03);
    assert.ok(boards.length > 3, `${name}/${fnd}: boards built`);
    for (const b of boards) {
      const p = b.geometry.parameters;
      const runsAlong = side ? p.depth > p.width : p.width > p.depth;
      assert.ok(runsAlong, `${name}/${fnd}: a board runs ${side ? 'along z' : 'along x'}`);
    }
    // straight down onto the porch: deck everywhere, out to the outer wall face
    const x0 = r.x0 + 0.01, x1 = r.x1 + (side ? c.WALL_FACE : (r.atEnd ? c.WALL_FACE : 0)) - 0.01;
    const z0 = r.z0 + 0.01, z1 = r.z1 + (side ? (r.atEnd ? c.WALL_FACE : 0) : c.WALL_FACE) - 0.01;
    for (const fx of [0, 0.5, 1]) for (const fz of [0, 0.5, 1]) {
      const x = x0 + (x1 - x0) * fx, z = z0 + (z1 - z0) * fz;
      // a 1/4in gap between boards is real; nudge across it rather than land in it
      const hitDeck = [-0.004, 0, 0.004].some(d => {
        const hits = new T.Raycaster(new T.Vector3(side ? x + d : x, 1.0, side ? z : z + d), new T.Vector3(0, -1, 0))
          .intersectObjects(m.filter(o => !isPost(o)), false);
        return hits.length && isDeck(hits[0].object);
      });
      assert.ok(hitDeck, `${name}/${fnd}: deck at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

test('on a slab the deck sits on it, level with the room floor — never coplanar with the concrete', () => {
  for (const [name, cfg] of CASES) for (const fnd of ['pad', 'existing']) {
    const m = build({ ...cfg, FOUNDATION:fnd });
    const deckTop = Math.max(...m.filter(isDeck).map(o => box(o).max.y));
    const slabTop = lift() + 0;                       // the slab's top is the floor line
    assert.ok(deckTop - slabTop > 0.02, `${name}/${fnd}: deck top ${deckTop.toFixed(3)} clear of slab ${slabTop.toFixed(3)}`);
    const boardsBottom = Math.min(...m.filter(o => isDeck(o) && (o.geometry.parameters.height || 0) < 0.03).map(o => box(o).min.y));
    assert.ok(boardsBottom >= slabTop - 1e-6, `${name}/${fnd}: boards rest on the slab, not in it`);
  }
});

test('the deck stays inside the porch: nothing pokes into the return walls or the room', () => {
  for (const [name, cfg] of CASES) {
    const m = build(cfg);
    const r = c.porchRect(), F = c.WALL_FACE + 1e-6;
    for (const o of m.filter(isDeck)) {
      const b = box(o);
      assert.ok(b.min.x >= r.x0 - (r.wall === 'front' && r.atStart ? F : 1e-6) && b.max.x <= r.x1 + (r.wall === 'right' || r.atEnd ? F : 1e-6), `${name}: deck x within the porch`);
      assert.ok(b.min.z >= r.z0 - (r.wall === 'right' && r.atStart ? F : 1e-6) && b.max.z <= r.z1 + (r.wall === 'front' || r.atEnd ? F : 1e-6), `${name}: deck z within the porch`);
    }
  }
});

test('an open corner gets a porch post the size of the full porches\', and no house corner trim', () => {
  const full = build({ W:12, PORCH_LOC:'front', SIDE_PORCH:4 });
  const fullPost = full.find(isPost).geometry.parameters;
  for (const [name, cfg] of CASES) {
    const m = build(cfg);
    const r = c.porchRect(), w = c.W * 0.2, l = c.L * 0.2;
    const corners = [];
    if (r.wall === 'front') { if (r.atStart) corners.push([-w / 2, l / 2]); if (r.atEnd) corners.push([w / 2, l / 2]); }
    else { if (r.atStart) corners.push([w / 2, -l / 2]); if (r.atEnd) corners.push([w / 2, l / 2]); }
    for (const [cx, cz] of corners) {
      const tall = m.filter(o => { const b = box(o);
        return b.max.y - b.min.y > 1.0 && b.max.x - b.min.x < 0.12 && b.max.z - b.min.z < 0.12 &&
               Math.abs((b.min.x + b.max.x) / 2 - cx) < 0.12 && Math.abs((b.min.z + b.max.z) / 2 - cz) < 0.12; });
      assert.equal(tall.length, 1, `${name}: exactly one upright at the open corner (${tall.length})`);
      assert.ok(isPost(tall[0]), `${name}: and it is a porch post`);
      const p = tall[0].geometry.parameters;
      assert.ok(Math.abs(p.width - fullPost.width) < 1e-6 && Math.abs(p.depth - fullPost.depth) < 1e-6, `${name}: same size as a full porch post`);
      const b = box(tall[0]), pcx = (b.min.x + b.max.x) / 2, pcz = (b.min.z + b.max.z) / 2;
      assert.ok(Math.abs(Math.abs(pcx - cx) - 0.05) < 1e-6 && Math.abs(Math.abs(pcz - cz) - 0.05) < 1e-6, `${name}: inset like a full porch post`);
    }
    // corners the porch does not touch keep their trim
    const kept = m.filter(o => { const b = box(o); return b.max.y - b.min.y > 1.0 && b.max.x - b.min.x < 0.12 && b.max.z - b.min.z < 0.12 &&
      Math.abs((b.min.x + b.max.x) / 2 + w / 2) < 0.1 && Math.abs((b.min.z + b.max.z) / 2 + l / 2) < 0.1; });
    assert.ok(kept.length >= 2, `${name}: the back-left corner still has its block and trim`);
  }
});

test('posts still never stand in front of a door (long side porch, centred door)', () => {
  const m = build({ L:20, PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:16, PORCH_OFF:2 },
    [{ wall:'right', pos:0.5, style:'basic', w:60, h:76 }]);
  const r = c.porchRect(), dc = c.posToAxis('right', 0.5, 60), hw = 60 * 0.2 / 24 + 0.07;
  const posts = m.filter(isPost).map(o => { const b = box(o); return (b.min.z + b.max.z) / 2; });
  assert.ok(posts.length >= 3, 'ends plus an intermediate');
  for (const z of posts) assert.ok(z <= dc - hw || z >= dc + hw, `post at z=${z.toFixed(2)} clear of the door ${(dc - hw).toFixed(2)}..${(dc + hw).toFixed(2)}`);
});

test('full-length porches build exactly as before (deck unchanged)', () => {
  const m = build({ W:12, PORCH_LOC:'front', SIDE_PORCH:4 });
  const deck = m.filter(o => isDeck(o) && (o.geometry.parameters.height || 0) < 0.03);
  assert.ok(deck.length > 5);
  const top = Math.max(...deck.map(o => box(o).max.y));
  assert.ok(Math.abs(top - (lift() + 0)) < 1e-6, 'full porch deck top still at the floor line');
});
