/* HOTFIX: A PARTIAL PORCH WITH NO DOOR IN IT.
 *
 * Live regression on a 14x26 with a 4ft front porch (an existing design,
 * shortened to a 4ft corner porch). Its 70in slider is too wide for the
 * porch, so it stays on the outer wall — and the stepped-in wall, with no
 * opening on it, went up as one solid panel at x=0 instead of at the porch.
 * The porch was open into the room. And with a finished interior, the porch
 * gaps were lined like door openings: two white jambs standing past the
 * wall top and out through the roof.
 *   node --test tests/geometry/porchinset.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

// The design's shape (no customer details): 14x26 gable, 4ft front porch,
// right dormer, slider on the front near the right end, painted interior.
const DESIGN = { v:1, style:'gable', w:14, l:26, h:8, pitch:8, siding:'vertical', roofType:'metal',
  ovh:4, ovType:'gable', porchLoc:'front', porchDepth:4, porchH:0, porchDeck:'pt', porchLen:0, porchOff:0,
  dormerL:0, dormerR:6, dormerLOff:0, dormerROff:0, foundation:'existing', intFinish:'painted',
  doors:[{ wall:'front', pos:0.9390681003584228, style:'slideglassB', w:70, h:80 },
         { wall:'back', pos:0.5868, style:'rollup', w:96, h:84, color:'black' }],
  windows:[{ wall:'right', pos:0.9415, w:48, h:36, cy:57, type:'Black Bi-Fold Bar 48x36', open:false, fold:'left', ledge:true }],
  vents:[], shelves:[], porchLights:[{ wall:'front', pos:0.432, style:'modern' }] };

function load(cfg) {
  c.__stubLights();
  try { c.applyDesignConfig(JSON.parse(JSON.stringify(cfg))); } catch (e) { /* DOM-only sync */ }
}
function rebuild() {
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh && x.visible !== false) o.push(x); });
  return o;
}
function firstHit(meshes, from, dir) {
  const rc = new T.Raycaster(new T.Vector3(...from), new T.Vector3(...dir).normalize());
  const h = rc.intersectObjects(meshes, false);
  return h.length ? h[0] : null;
}
function assertClosed(m, label) {
  const r = c.porchRect();
  for (const f of [0.25, 0.5, 0.75]) {
    if (r.wall === 'front') {
      const x = r.x0 + (r.x1 - r.x0) * f;
      const h = firstHit(m, [x, 0.8, r.z1 + 2], [0, 0, -1]);
      assert.ok(h && h.point.z > r.z0 - 0.1, `${label}: the stepped-in wall closes the porch at x=${x.toFixed(2)} (hit z=${h && h.point.z.toFixed(2)}, wall at ${r.z0.toFixed(2)})`);
    } else {
      const z = r.z0 + (r.z1 - r.z0) * f;
      const h = firstHit(m, [r.x1 + 2, 0.8, z], [-1, 0, 0]);
      assert.ok(h && h.point.x > r.x0 - 0.1, `${label}: the stepped-in wall closes the porch at z=${z.toFixed(2)} (hit x=${h && h.point.x.toFixed(2)}, wall at ${r.x0.toFixed(2)})`);
    }
  }
}
function nothingPastWallTopAtGapEdges(m, label) {
  const r = c.porchRect(), top = c.H * 0.2;
  const bb = new T.Box3(), bad = [];
  for (const o of m) {
    if (!/^(Box|Extrude)Geometry$/.test(o.geometry.type)) continue;   // built pieces, not sky/ground planes
    bb.setFromObject(o);
    if (bb.max.y < top + 0.15 || bb.min.y > 0.3) continue;  // standing on the floor, rising past the wall top
    if (bb.max.x < r.x0 - 0.1 || bb.min.x > r.x1 + 0.1 || bb.max.z < r.z0 - 0.1 || bb.min.z > r.z1 + 0.1) continue;
    bad.push([bb.min.toArray().map(v => +v.toFixed(2)), bb.max.toArray().map(v => +v.toFixed(2))]);
  }
  assert.deepEqual(bad, [], `${label}: nothing stands from the floor up past the wall top at the porch`);
}

test('the saved design loads as it was: full-length front porch, slider where it was', () => {
  load(DESIGN); rebuild();
  assert.equal(c.PORCH_LOC, 'front'); assert.equal(c.porchIsPartial(), false);
  assert.ok(Math.abs(c.doorsData[0].pos - 0.9390681003584228) < 1e-9);
});

test('4ft corner front porch, slider too wide to go in: the porch is closed, no jambs through the roof', () => {
  load(DESIGN); rebuild();
  c.setPorchLen(4); c.setPorchAlign('right');
  const m = rebuild();
  const r = c.porchRect();
  assert.ok(r.atEnd && Math.abs(r.a1 - r.a0 - 0.8) < 1e-6);
  const dc = c.posToAxis('front', c.doorsData[0].pos, 70);
  assert.ok(dc < r.a0, 'the slider stayed on the outer wall');
  assertClosed(m, 'right-hand corner');
  nothingPastWallTopAtGapEdges(m, 'right-hand corner');
  c.setPorchAlign('center'); assertClosed(rebuild(), 'mid-wall');
  c.setPorchAlign('left');   const ml = rebuild(); assertClosed(ml, 'left-hand corner'); nothingPastWallTopAtGapEdges(ml, 'left-hand corner');
});

test('4x4 side porch with no door in it is closed too, finished or not', () => {
  for (const fin of ['painted', 'none']) {
    load({ ...DESIGN, w:10, l:20, porchLoc:'side', porchDepth:4, dormerR:0, intFinish:fin,
      doors:[{ wall:'front', pos:0.5, style:'craftsman', w:36, h:76 }], windows:[], porchLights:[] });
    rebuild();
    c.setPorchLen(4);
    for (const al of ['left', 'right']) {          // off-centre: centred, x=0 happened to be right
      c.setPorchAlign(al);
      const m = rebuild();
      assertClosed(m, 'side, ' + fin + ', ' + al);
      nothingPastWallTopAtGapEdges(m, 'side, ' + fin + ', ' + al);
    }
  }
});

test('the stepped-in wall is built where the porch is, with or without an opening on it', () => {
  load({ ...DESIGN, w:10, l:20, porchLoc:'side', porchDepth:4, dormerR:0,
    doors:[{ wall:'right', pos:0.5, style:'craftsman', w:36, h:76 }], windows:[], porchLights:[] });
  rebuild(); c.setPorchLen(4);
  assertClosed(rebuild(), 'side, door in porch');
});
