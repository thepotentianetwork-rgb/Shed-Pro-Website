/* THE PORCH ROOF HAS TO CLOSE, WHATEVER THE OVERHANG.
 *
 * A front porch is covered by the main gable roof carried forward over it —
 * zFront is roofEdgeZ + fpD, and roofEdgeZ already carries the gable overhang.
 * The flat porch ceiling underneath was built to the porch's OWN footprint:
 * w wide by fpD deep, with no overhang on it at all. So the roof reached
 * further than the ceiling did and left a full-width slot at the porch's
 * leading edge, gableOv deep, open straight into the roof cavity. It grew inch
 * for inch with the overhang — 4in at a 4in overhang, 24in at 24in — which is
 * exactly how it was reported.
 *
 * These tests fire rays, they do not read numbers back out of the code that
 * placed the meshes: from just under the roof line, upward, across the whole
 * porch. If a ray gets out, the porch is open. The reverse direction is tested
 * too, because the fix widens the ceiling and a flat panel pushed too far out
 * would rise through the sloping roof rather than tuck under it.
 *
 * Fetch three.js first (see harness.mjs), then:
 *   node --test tests/geometry/porch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

function build(cfg) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, SOFFIT:'cedar',
    PORCH_LOC:'none', SIDE_PORCH:0 }, cfg);
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh) o.push(x); });
  return o;
}
const INCH = 0.2 / 12, TW = 0.06;
const gableOvFor = (t, ovh) => (t === 'gable' ? (TW/2 + 0.026) : ovh * INCH);

// Anything overhead within a hand's width of the roof line closes the porch.
function closedAbove(objs, x, z, lift, h) {
  const rc = new T.Raycaster(new T.Vector3(x, lift + h - 0.06, z), new T.Vector3(0,1,0), 0, 20);
  return rc.intersectObjects(objs, false).some(v => v.point.y < lift + h + 0.12);
}

const OVERHANGS = [4, 6, 12, 18, 24];

for (const OVTYPE of ['all4', 'gable']) {
  for (const OVH of OVERHANGS) {
    test(`front porch is closed overhead — ${OVTYPE} overhang, ${OVH}in`, () => {
      const objs = build({ PORCH_LOC:'front', SIDE_PORCH:6, OVH, OVTYPE });
      const lift = c.shedGroup.position.y, h = c.H*0.2, l = c.encLft()*0.2, w = c.encWft()*0.2;
      const z0 = l/2, z1 = l/2 + 6*0.2 + gableOvFor(OVTYPE, OVH);
      const open = [];
      for (let z = z0 + 0.02; z < z1 - 0.01; z += 0.03)
        for (let x = -(w/2); x <= w/2; x += 0.10)
          if (!closedAbove(objs, x, z, lift, h)) open.push([+x.toFixed(2), +z.toFixed(2)]);
      assert.deepEqual(open.slice(0,5), [],
        `${open.length} points under the roof are open to the sky; first few (x,z): ` +
        JSON.stringify(open.slice(0,5)));
    });
  }
}

test('the slot scaled with the overhang, so every overhang is covered equally', () => {
  // The regression's signature: a deeper overhang opened a deeper slot. Test
  // the property, not one value — a fix that only closes 12in is not a fix.
  const results = OVERHANGS.map((OVH) => {
    const objs = build({ PORCH_LOC:'front', SIDE_PORCH:6, OVH });
    const lift = c.shedGroup.position.y, h = c.H*0.2, l = c.encLft()*0.2;
    const z0 = l/2 + 6*0.2, z1 = z0 + OVH*INCH;     // the projection itself
    let open = 0, tot = 0;
    for (let z = z0 + 0.005; z < z1 - 0.005; z += 0.005) { tot++; if (!closedAbove(objs, 0, z, lift, h)) open++; }
    return { OVH, open, tot };
  });
  for (const r of results)
    assert.equal(r.open, 0, `${r.OVH}in overhang: ${r.open} of ${r.tot} samples along the projection are open`);
});

for (const PITCH of [4, 6, 10]) {
  for (const depth of [4, 6, 8]) {
    test(`the ceiling tucks under the roof, never through it — pitch ${PITCH}, ${depth}ft porch`, () => {
      /* The ceiling is flat at wall-top height and the roof is on its way down
         to the eave, so the panel can only reach the wall FACE. A step further
         and it rises through the roof — visible from outside as a panel edge
         sticking out of the shingles. Seen from above, the first thing a ray
         hits over the porch must never be the ceiling. */
      const objs = build({ PORCH_LOC:'front', SIDE_PORCH:depth, PITCH, OVH:24 });
      const lift = c.shedGroup.position.y, h = c.H*0.2, l = c.encLft()*0.2, w = c.encWft()*0.2;
      const z0 = l/2, z1 = l/2 + depth*0.2 + 24*INCH;
      const poke = [];
      for (let z = z0 + 0.02; z < z1 - 0.01; z += 0.03)
        for (let x = -(w/2) - 0.03; x <= w/2 + 0.03; x += 0.08) {
          const rc = new T.Raycaster(new T.Vector3(x, 9, z), new T.Vector3(0,-1,0), 0, 40);
          const hit = rc.intersectObjects(objs, false)[0];
          if (hit && Math.abs(hit.point.y - (lift + h)) < 0.004) poke.push([+x.toFixed(2), +z.toFixed(2)]);
        }
      assert.deepEqual(poke.slice(0,5), [],
        `the ceiling is the topmost surface at ${poke.length} points — it is poking through the roof`);
    });
  }
}

for (const OVH of [4, 12, 24]) {
  test(`side porch stays closed too — ${OVH}in overhang`, () => {
    // Untouched by this change, and it has to stay that way: the side porch
    // has its own roof that ledgers onto the wall.
    const objs = build({ PORCH_LOC:'side', SIDE_PORCH:6, OVH });
    const gr = c.gableRoof(), a = c.porchSideAttach(), lift = c.shedGroup.position.y;
    const open = [];
    for (let z = -1.9; z <= 1.9; z += 0.1)
      for (let x = gr.run + 0.02; x < a.outX - 0.02; x += 0.04) {
        const rc = new T.Raycaster(new T.Vector3(x, lift + 0.08, z), new T.Vector3(0,1,0), 0, 30);
        if (!rc.intersectObjects(objs, false).length) open.push([+x.toFixed(2), +z.toFixed(2)]);
      }
    assert.deepEqual(open.slice(0,5), [], `${open.length} points over the side porch see sky`);
  });
}
