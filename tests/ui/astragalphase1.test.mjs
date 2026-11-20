/* BASIC DOUBLE ASTRAGAL + PHASE 1 WINDOW / TRIM REALISM (Nando, 19 Nov 2026).
 * - Basic double: one exterior door-colour strip, fastened to the RIGHT
 *   (active) leaf, lapping the left over the 5/16in centre gap; no room-side
 *   centre stop. Cedar doubles, singles and residential doubles get no strip.
 * - Windows: a drip cap on every head casing in the TRIM material (so Cedar /
 *   Stained Cedar reach it); upright units show a two-depth meeting rail.
 *   node --test tests/ui/astragalphase1.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const IN = 0.2 / 12;
function setup() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  return c;
}
function rebuild(c) { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); }
function find(c, pred) { const out = []; c.shedGroup.traverse((o) => { if (o.isMesh && pred(o)) out.push(o); }); return out; }
function withDoor(c, style, w) {
  c.doorsData.length = 0;
  c.doorsData.push({ wall: 'front', pos: 0.5, style, w, h: 76 });
  rebuild(c);
}
const c = setup();

test('Basic 6ft double: one exterior strip on the active right leaf, lapping the left over the gap', () => {
  withDoor(c, 'basic', 72);
  const a = find(c, (o) => o.userData && o.userData.astragal);
  assert.equal(a.length, 1);
  const m = a[0], p = m.geometry.parameters;
  assert.ok(Math.abs(p.width - 1.5 * IN) < 1e-9, '1.5in wide');
  assert.ok(Math.abs(p.depth - 0.75 * IN) < 1e-9, '3/4in proud');
  const left = m.position.x - p.width / 2, right = m.position.x + p.width / 2;
  assert.ok(left < -(5 / 16 * IN) / 2 - 0.5 * IN, 'laps over the left (inactive) leaf');
  assert.ok(right > 0, 'and carries onto the right (active) leaf');
  assert.ok(m.position.z - p.depth / 2 >= 0.039 - 1e-9, 'on the exterior, seated on the leaf trim face');
  assert.ok(p.height > 76 * IN * 0.9, 'runs the leaf height');
});

test('Basic double has no room-side centre stop; other doubles keep theirs', () => {
  const centreStop = () => find(c, (o) => o.geometry.type === 'BoxGeometry' && Math.abs(o.position.x) < 1e-9
    && Math.abs(o.position.z + 0.0295) < 1e-9 && Math.abs(o.geometry.parameters.width - 0.03) < 1e-9);
  withDoor(c, 'basic', 72); assert.equal(centreStop().length, 0);
  withDoor(c, 'xtrim', 72); assert.equal(centreStop().length, 1, 'X-trim double keeps the room-side stop');
});

for (const [style, w, why] of [['cedar', 72, 'Cedar double'], ['basic', 36, 'Basic single'], ['resDouble', 72, 'residential double'], ['xtrim', 72, 'X-trim double']]) {
  test(`${why}: no exterior astragal`, () => {
    withDoor(c, style, w);
    assert.equal(find(c, (o) => o.userData && o.userData.astragal).length, 0);
  });
}

test('every window head casing gets a drip cap in the trim material — painted, Cedar and Stained Cedar', () => {
  withDoor(c, 'basic', 72);
  c.windowsData.length = 0;
  c.windowsData.push({ wall: 'left', pos: 0.5, w: 24, h: 36, cy: 58, type: 'Black Vinyl 24x36' });
  c.windowsData.push({ wall: 'right', pos: 0.5, w: 36, h: 24, cy: 58, type: 'White Vinyl 36x24' });
  rebuild(c);
  let caps = find(c, (o) => o.userData && o.userData.dripCap);
  assert.equal(caps.length, 2);
  for (const k of ['cedar', 'stained-cedar']) {
    c.setTrimWood(k); rebuild(c);
    caps = find(c, (o) => o.userData && o.userData.dripCap);
    assert.equal(caps.length, 2);
    caps.forEach((m) => assert.ok(m.material.map, `${k}: drip cap carries the wood grain`));
    caps.forEach((m) => assert.ok(!m.material.bumpMap && !m.material.normalMap, `${k}: no panel lines`));
  }
});

test('an upright window shows a two-depth meeting rail; a wide band keeps its single divider', () => {
  c.TRIM_FINISH = 'paint';
  c.windowsData.length = 0;
  c.windowsData.push({ wall: 'left', pos: 0.5, w: 24, h: 36, cy: 58, type: 'Black Vinyl 24x36' });
  rebuild(c);
  const rails = (len) => find(c, (o) => o.geometry.type === 'BoxGeometry' && o.parent && o.parent.userData && o.parent.userData.isWindow
    && Math.abs(o.geometry.parameters.width - len) < 1e-9 && Math.abs(o.position.y - 58 * IN) < 0.03 && o.geometry.parameters.height < 0.02);
  const r = rails(24 * IN);
  assert.equal(r.length, 2, 'two rails');
  assert.ok(Math.abs(r[0].position.z - r[1].position.z) > 0.004, 'at two depths');
});
