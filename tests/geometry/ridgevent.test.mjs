/* THE RIDGE VENT SITS ON THE RIDGE, IT DOES NOT HOVER OVER IT.
 *
 * The Roof Ridge Vent add-on was a flat-bottomed 4.5in x 1.8in box whose
 * underside was 0.026 (~1.6in) above the deck at the ridge line — about an
 * inch clear of the ridge cap — and because its bottom was flat while the roof
 * falls away on both sides, the gap opened to 2-3in at its edges. From the
 * gable end it read as a black plank floating over the peak (reported on a
 * customer's 14x26 metal-roof gable as "the roof cap is a little weird").
 *
 * Rays, not numbers: across the ridge (along X), at every height between the
 * plain cap's top and the vent's top, something must be hit — if a ray gets
 * through, there is daylight under the vent. And the vent has to stay low:
 * a shingle-over vent stands well under an inch and a half proud of the cap.
 *
 *   node --test tests/geometry/ridgevent.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

function build(cfg, vent) {
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:4,
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, WALLS_XRAY:false,
    PORCH_LOC:'none', SIDE_PORCH:0, DORMER_L:0, DORMER_R:0 }, cfg);
  c.ADDONS = Object.assign({}, c.ADDONS || {}, { ridgeVent: !!vent, cupola: cfg.cupola || 'none' });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh) o.push(x); });
  return o;
}
// Highest surface straight down at (x, z).
function topAt(objs, x, z) {
  const rc = new T.Raycaster(new T.Vector3(x, 50, z), new T.Vector3(0,-1,0), 0, 100);
  const h = rc.intersectObjects(objs, false);
  return h.length ? h[0].point.y : -Infinity;
}
// The ridge line: scan across the roof for the highest point at this z.
function ridgeAt(objs, z) {
  let best = { x: 0, y: -Infinity };
  for (let x = -1.5; x <= 1.5; x += 0.005) {
    const y = topAt(objs, x, z); if (y > best.y) best = { x, y };
  }
  return best;
}

const CASES = [];
for (const STYLE of ['gable', '3peak', '4peak'])
  for (const ROOFTYPE of ['shingle', 'metal'])
    for (const PITCH of [6, 8, 12])
      CASES.push({ STYLE, ROOFTYPE, PITCH });
// The customer's shed that showed it, and the two that cut / extend the run.
CASES.push({ STYLE:'gable', ROOFTYPE:'metal', PITCH:8, W:14, L:26, OVTYPE:'gable', PORCH_LOC:'front', SIDE_PORCH:4, DORMER_R:6 });
CASES.push({ STYLE:'gable', ROOFTYPE:'shingle', PITCH:6, cupola:'black' });

for (const cfg of CASES) {
  const name = Object.entries(cfg).map(([k, v]) => `${k}=${v}`).join(' ');
  test(`ridge vent rests on the ridge cap — ${name}`, () => {
    const l = (cfg.L || 16) * 0.2;
    for (const z of [-l/4, l/4 - 0.05]) {
      const plain = build(cfg, false);
      const r0 = ridgeAt(plain, z);
      const vented = build(cfg, true);
      const ventTop = topAt(vented, r0.x, z);
      assert.ok(ventTop > r0.y + 0.004, `no vent over the ridge at z=${z.toFixed(2)}`);
      // Low profile: under 1.5in proud of the plain cap.
      assert.ok(ventTop - r0.y < 0.025,
        `vent stands ${((ventTop - r0.y)/0.2*12).toFixed(2)}in above the cap (max 1.5in)`);
      // No daylight underneath: every height between cap and vent top is solid.
      const open = [];
      for (let y = r0.y + 0.002; y < ventTop - 0.002; y += 0.002) {
        const rc = new T.Raycaster(new T.Vector3(r0.x - 3, y, z), new T.Vector3(1,0,0), 0, 6);
        const hit = rc.intersectObjects(vented, false).some(h => Math.abs(h.point.x - r0.x) < 0.15);
        if (!hit) open.push(+((y - r0.y)/0.2*12).toFixed(2));
      }
      assert.deepEqual(open, [], `daylight under the vent at z=${z.toFixed(2)}, inches above the cap: ${open.join(', ')}`);
    }
  });
}
