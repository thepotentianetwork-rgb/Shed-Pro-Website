/* PORCH LIGHTS GO ANYWHERE ON THE PORCH (Nando, 9 Oct 2026).
 *
 * "I can't put a porch light where I want it closer to the outside wall, and
 * I also can't put it on the opposite side of the porch." A hand-placed light
 * now reaches 3in of siding from the corner trim, never sits over an opening,
 * and on a partial porch can hang on the return walls, facing into the porch.
 *   node --test tests/geometry/porchlights.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
c.camera = new T.PerspectiveCamera(45, 1, 0.1, 100);
const IN = 0.2 / 12;

// Annie Quan's shape (config only): 14x26 gable, full 4ft front porch, slider at the right.
const BASE = { v:1, style:'gable', w:14, l:26, h:8, pitch:8, siding:'vertical', roofType:'metal', ovh:4, ovType:'gable',
  porchLoc:'front', porchDepth:4, porchH:0, porchDeck:'pt', porchLen:0, porchOff:0, foundation:'existing', elec:'core',
  doors:[{ wall:'front', pos:0.939, style:'slideglassB', w:70, h:80 }], windows:[], vents:[], shelves:[],
  porchLights:[{ wall:'front', pos:0.432, style:'modern' }] };

function load(cfg) { c.__stubLights(); try { c.applyDesignConfig(JSON.parse(JSON.stringify(cfg))); } catch (e) {} }
function rebuild() { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true); }
function lightBox(i) {
  const g = c.porchLightMeshes.find(m => m.index === i).group;
  const b = new T.Box3(); g.traverse(o => { if (o.isMesh && !(o.material && o.material.transparent && o.material.opacity === 0.5)) b.expandByObject(o); });
  return { b, g };
}
const DOOR_PORCH = { ...BASE, w:16, l:20, doors:[{ wall:'front', pos:0.5, style:'craftsman', w:36, h:76 }],
  porchLights:[{ wall:'front', pos:0.3, style:'modern' }] };

test('full porch: a light goes to 3in of siding from the corner trim, both ends', () => {
  load(BASE); rebuild();
  const L = c.porchLightsData[0], f = c.wallFrame('front');
  assert.ok(c.plPlace(L, 'main', 0)); rebuild();
  let { b } = lightBox(0);
  const x0 = f.ctr - f.len / 2;
  const gapL = b.min.x - x0;
  assert.ok(Math.abs(gapL - (0.06 + 3 * IN)) < 0.004, 'fixture edge 3in past the corner trim, got ' + (gapL / IN).toFixed(2) + 'in from the corner');
  // the old drag clamp held its centre 0.17 off the corner
  assert.ok(b.min.x + 0.033 < x0 + 0.17 - 0.02, 'closer than the old clamp allowed');
  // the far end has the slider, so the nearest free spot is beside it, never on it
  c.plPlace(L, 'main', f.len); rebuild();
  ({ b } = lightBox(0));
  const obs = c.plObstacles('front').find(o => o.kind === 'door');
  const s = b.max.x - x0;
  assert.ok(s <= obs.a + 1e-6 || b.min.x - x0 >= obs.b - 1e-6, 'not over the slider');
  assert.deepEqual(Array.from(c.plSurfaces('front'), x => x.id), ['main'], 'a full porch has only its door wall (open ends)');
});

test('a light is never left over a door: aimed at the door it lands beside it, either side', () => {
  load(DOOR_PORCH); rebuild();
  const L = c.porchLightsData[0], f = c.wallFrame('front');
  const d = c.plObstacles('front').find(o => o.kind === 'door');
  for (const aim of [d.c - 0.01, d.c + 0.01]) {
    c.plPlace(L, 'main', aim); rebuild();
    const { b } = lightBox(0), x0 = f.ctr - f.len / 2;
    assert.ok(b.max.x - x0 <= d.a + 1e-6 || b.min.x - x0 >= d.b - 1e-6, 'clear of the door casing');
    assert.equal((aim < d.c), (b.max.x - x0 <= d.a + 1e-6), 'lands on the side it was aimed at');
  }
});

test('partial porch mid-wall: both return walls offered; a light there faces into the porch at mount height', () => {
  load(DOOR_PORCH); rebuild();
  c.setPorchLen(8); c.setPorchAlign('center'); rebuild();
  const r = c.porchRect();
  assert.deepEqual(Array.from(c.plSurfaces('front'), x => x.id), ['main', 'start', 'end']);
  const L = c.porchLightsData[0];
  for (const [ret, faceX] of [['start', r.x0], ['end', r.x1]]) {
    c.setPorchLightSurface(0, ret);
    assert.equal(L.ret, ret);
    rebuild();
    const { b, g } = lightBox(0);
    const inward = ret === 'start' ? 1 : -1;
    // seated on the return wall face, standing out into the porch
    assert.ok(Math.abs((inward > 0 ? b.min.x : b.max.x) - faceX) < 0.01, ret + ': backplate on the return wall face');
    assert.ok((inward > 0 ? b.max.x - faceX : faceX - b.min.x) > 0.04, ret + ': fixture stands out into the porch');
    assert.ok(b.min.z > r.z0 && b.max.z < r.z1, ret + ': within the return wall, between the stepped-in wall and the porch edge');
    const cy = (b.min.y + b.max.y) / 2;
    assert.ok(Math.abs(cy - c.shedGroup.position.y - Math.min(6 * 0.2, c.plWallTop('front') - 0.1 - 0.079)) < 0.01, ret + ': mounted at ~6ft');
    assert.equal(g.userData.faceN[0], inward);
    // near the porch's outer edge: 3in of siding from it
    c.plPlace(L, ret, 99); rebuild();
    const bb = lightBox(0).b;
    assert.ok(Math.abs((r.z1 - bb.max.z) - (0.06 + 3 * IN)) < 0.004, ret + ': close to the outer corner');
  }
  c.setPorchLightSurface(0, 'main'); assert.equal(L.ret, undefined);
});

test('corner porch: only the return wall that exists is offered', () => {
  load(DOOR_PORCH); rebuild();
  c.setPorchLen(8); c.setPorchAlign('left'); rebuild();
  assert.deepEqual(Array.from(c.plSurfaces('front'), x => x.id), ['main', 'end']);
  c.setPorchAlign('right'); rebuild();
  assert.deepEqual(Array.from(c.plSurfaces('front'), x => x.id), ['main', 'start']);
});

test('side partial porch: return walls face along z into the porch', () => {
  load({ ...DOOR_PORCH, w:12, l:20, porchLoc:'side', doors:[{ wall:'right', pos:0.5, style:'craftsman', w:36, h:76 }],
    porchLights:[{ wall:'right', pos:0.3, style:'craftsman' }] }); rebuild();
  c.setPorchLen(8); c.setPorchAlign('center'); rebuild();
  const r = c.porchRect();
  assert.equal(r.wall, 'right');
  c.setPorchLightSurface(0, 'end'); rebuild();
  const { b, g } = lightBox(0);
  assert.ok(Math.abs(b.max.z - r.z1) < 0.01 && b.min.z < r.z1 - 0.04, 'on the end return, standing into the porch');
  assert.ok(b.min.x > r.x0 && b.max.x < r.x1);
  assert.deepEqual(Array.from(g.userData.faceN), [0, 0, -1]);
});

test('dragging: a ray onto a return wall lands on it; onto the stepped-in wall stays on the wall', () => {
  load(DOOR_PORCH); rebuild();
  c.setPorchLen(8); c.setPorchAlign('center'); rebuild();
  const r = c.porchRect();
  // standing out front, right of centre, looking at the left return wall
  const ro = new T.Vector3(r.x1 + 0.5, 1.2, r.z1 + 2.5);
  const target = new T.Vector3(r.x0, 1.2, (r.z0 + r.z1) / 2);
  let hit = c.plRayToSurface('front', ro, target.clone().sub(ro).normalize());
  assert.equal(hit && hit.surface, 'start');
  assert.ok(Math.abs(hit.s - r.d / 2) < 0.01);
  const t2 = new T.Vector3((r.x0 + r.x1) / 2 - 0.3, 1.2, r.z0);
  hit = c.plRayToSurface('front', ro, t2.clone().sub(ro).normalize());
  assert.equal(hit.surface, 'main');
  // from behind a return wall it is not grabbable through the wall
  const ro2 = new T.Vector3(r.x0 - 1.5, 1.2, r.z1 + 0.3);
  hit = c.plRayToSurface('front', ro2, target.clone().sub(ro2).normalize());
  assert.ok(!hit || hit.surface !== 'start');
});

test('saved with the light on a return wall, it comes back there; made full-length, it falls back to the door wall', () => {
  load(DOOR_PORCH); rebuild();
  c.setPorchLen(8); c.setPorchAlign('center'); rebuild();
  c.setPorchLightSurface(0, 'end');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.porchLights[0].ret, 'end');
  load(cfg); rebuild();
  assert.equal(c.porchLightsData[0].ret, 'end');
  c.setPorchLen(0); rebuild();                     // full-length again: no return walls
  const { b } = lightBox(0), f = c.wallFrame('front');
  assert.ok(Math.abs(b.max.z - b.min.z) < 0.2 && b.min.z >= f.fixed - 0.01, 'hangs on the porch wall');
});
