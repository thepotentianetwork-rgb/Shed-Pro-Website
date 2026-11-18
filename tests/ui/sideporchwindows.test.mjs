/* SIDE PORCH STANDARD LAYOUT — WINDOWS ON THE LEFT AND RIGHT WALLS.
 *
 * Nando (17 Nov): "The side porch still has the window and door overlapping.
 * For the side porch style switch the standard shed to have windows on both
 * the right wall and left wall."
 *
 * Facing a side porch, the door is on the porch wall ('right' internally) and
 * the gable ends ('front', 'back') are its left and right walls. The standard
 * pair (one window centred on each long side) moves to the gable ends, so the
 * door wall carries no window. And the live bug: Front -> Side cleared the door
 * wall against the FRONT porch's longer footprint, so the window slid back
 * under the door once the shed rebuilt at its real length.
 *   node --test tests/ui/sideporchwindows.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const IN = 0.2 / 12;
function setup(porchAdds) {
  const { c } = loadDesigner({ porchAdds });
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  return c;
}
function rebuild(c) { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); }
function overlaps(c) {
  const b = [];
  c.doorsData.forEach((d, i) => b.push({ k: 'door' + i, wall: d.wall, c: c.posToAxis(d.wall, d.pos, d.w), half: d.w * IN / 2 + 0.07, y0: 0, y1: d.h }));
  c.windowsData.forEach((d, i) => { const cy = d.cy == null ? 52 : d.cy;
    b.push({ k: 'win' + i, wall: d.wall, c: c.posToAxis(d.wall, d.pos, d.w), half: d.w * IN / 2 + 0.055, y0: cy - d.h / 2, y1: cy + d.h / 2 }); });
  const bad = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const p = b[i], q = b[j];
    if (p.wall !== q.wall || !(p.y1 > q.y0 && q.y1 > p.y0)) continue;
    const ov = p.half + q.half - Math.abs(p.c - q.c);
    if (ov > 1e-4) bad.push(`${p.wall}: ${p.k} and ${q.k} overlap ${(ov / IN).toFixed(1)}in`);
  }
  return bad;
}
// The page's own fresh-load default: 6ft front double, one window centred on each long side.
function stock(c, W, L) {
  c.pickStyle('gable', null);
  c.SIZE_SET_BY_CUSTOMER = true;
  c.setW(W); c.setL(L);
  c.doorsData.length = 0; c.windowsData.length = 0;
  c.doorsData.push({ wall: 'front', pos: 0.5, style: 'basic', w: 72, h: 76 });
  c.windowsData.push({ wall: 'left', pos: 0.5, w: 24, h: 36, cy: 58, type: 'Black Vinyl 24x36' });
  c.windowsData.push({ wall: 'right', pos: 0.5, w: 24, h: 36, cy: 58, type: 'Black Vinyl 24x36' });
  rebuild(c);
}
const walls = (c) => c.windowsData.map((w) => w.wall).sort().join(',');

for (const porchAdds of [true, false]) {
  const c = setup(porchAdds);

  test(`porchAdds=${porchAdds}: fresh-load default really is the left/right pair`, () => {
    const f = setup(porchAdds);
    assert.equal(JSON.stringify(f.windowsData.map((w) => [w.wall, w.pos])), JSON.stringify([['left', 0.5], ['right', 0.5]]));
  });

  for (const [W, L] of [[10, 12], [8, 10], [10, 16], [12, 20], [12, 24]]) {
    test(`porchAdds=${porchAdds}: ${W}x${L} Side Porch — door on the porch wall, a window on each gable end, none on the door wall`, () => {
      stock(c, W, L);
      c.pickPorchStyle('side', null); rebuild(c);
      assert.equal(c.doorsData.length, 1);
      assert.equal(c.doorsData[0].wall, 'right', 'door on the porch wall');
      assert.ok(Math.abs(c.doorsData[0].pos - 0.5) < 1e-9, 'door stays centred');
      assert.equal(walls(c), 'back,front', 'one window on each side wall');
      assert.equal(c.windowsData.filter((w) => w.wall === 'right').length, 0, 'no window on the door wall');
      c.windowsData.forEach((w) => assert.ok(Math.abs(w.pos - 0.5) < 1e-9, 'centred'));
      assert.deepEqual(overlaps(c), []);
    });
  }

  test(`porchAdds=${porchAdds}: Front -> Side (the live path) never leaves a window under the door`, () => {
    for (const [W, L] of [[10, 12], [10, 16], [12, 20]]) {
      stock(c, W, L);
      c.pickPorchStyle('front', null); rebuild(c);
      c.pickPorchStyle('side', null); rebuild(c);
      assert.equal(c.doorsData[0].wall, 'right');
      assert.equal(walls(c), 'back,front', `${W}x${L}`);
      assert.deepEqual(overlaps(c), [], `${W}x${L}`);
    }
  });

  test(`porchAdds=${porchAdds}: leaving the side porch puts the pair back on the long sides`, () => {
    stock(c, 10, 12);
    c.pickPorchStyle('side', null); rebuild(c);
    c.pickPorchStyle('front', null); rebuild(c);
    assert.equal(walls(c), 'left,right', 'front porch');
    c.pickPorchStyle('side', null); rebuild(c);
    assert.equal(walls(c), 'back,front');
    c.pickStyle('barn', null); rebuild(c);
    assert.equal(walls(c), 'left,right', 'another style');
    assert.equal(c.windowsData.length, 2);
  });

  test(`porchAdds=${porchAdds}: a window the customer moved stays where they put it`, () => {
    stock(c, 10, 12);
    c.pickPorchStyle('side', null); rebuild(c);
    c.windowsData[0].pos = 0.3; rebuild(c);
    c.pickPorchStyle('front', null); rebuild(c);
    assert.equal(c.windowsData[0].wall, 'front', 'not dragged back to the long side');
    assert.deepEqual(overlaps(c), []);
  });

  test(`porchAdds=${porchAdds}: a customer window added on the door wall can't sit on the door`, () => {
    stock(c, 10, 12);
    c.pickPorchStyle('side', null); rebuild(c);
    for (const pos of [0.5, 0.4, 0.6, 0.3]) {
      c.windowsData.push({ wall: 'right', pos, w: 24, h: 30, cy: 52, type: 'White Vinyl 24x30' });
      rebuild(c);
      assert.deepEqual(overlaps(c), [], `added at ${pos}`);
      c.windowsData.pop();
    }
  });

  test(`porchAdds=${porchAdds}: shortening the shed keeps a door-wall window off the door`, () => {
    stock(c, 10, 20);
    c.windowsData.push({ wall: 'right', pos: 0.85, w: 24, h: 36, cy: 58, type: 'Black Vinyl 24x36' });   // customer's own, so no swap
    c.pickPorchStyle('side', null); rebuild(c);
    assert.deepEqual(overlaps(c), []);
    const onDoorWall = () => overlaps(c).filter((o) => o.startsWith('right:'));
    for (const L of [16, 12, 10]) { c.setL(L); rebuild(c); assert.deepEqual(onDoorWall(), [], `L${L}`); }
  });

  test(`porchAdds=${porchAdds}: same window count, sizes and types — nothing prices differently`, () => {
    stock(c, 10, 12);
    const before = c.windowsData.map((w) => [w.w, w.h, w.type]).sort();
    c.pickPorchStyle('side', null); rebuild(c);
    assert.deepEqual(c.windowsData.map((w) => [w.w, w.h, w.type]).sort(), before);
  });
}

/* "The wall with the standard door is the front" — on every style. */
test('wall names are taken from the door wall: side porch door is the Front, gable ends are Left/Right', () => {
  const c = setup(true);
  stock(c, 10, 12);
  assert.equal(c.doorFrontWall(), 'front');
  assert.equal(['front', 'right', 'back', 'left'].map(c.wallLabelFor).join('|'), 'Front wall|Right wall|Back wall|Left wall', 'unchanged with the door on the front');
  c.pickPorchStyle('side', null); rebuild(c);
  assert.equal(c.doorFrontWall(), 'right');
  assert.equal(c.wallLabelFor('right'), 'Front wall', 'the door wall');
  assert.equal(c.wallLabelFor('front'), 'Left wall', 'facing the door, the +z gable end is on your left');
  assert.equal(c.wallLabelFor('back'), 'Right wall');
  assert.equal(c.wallLabelFor('left'), 'Back wall');
  // the two windows: one on the Left wall, one on the Right wall
  assert.equal(c.windowsData.map((w) => c.wallLabelFor(w.wall)).sort().join('|'), 'Left wall|Right wall');
});

test('the quote snapshot faces the door wall (and is unchanged when the door is on the front)', () => {
  const c = setup(true);
  stock(c, 10, 12);
  const thetas = [];
  const realUpdate = c.updateCamera;
  const snap = () => { c.updateCamera = () => { thetas.push(c.theta); }; try { c.captureRenders(); } finally { c.updateCamera = realUpdate; } };
  snap();
  c.pickPorchStyle('side', null); rebuild(c);
  snap();
  assert.ok(Math.abs(thetas[0] - 0.62) < 1e-9, 'door on the front: same 0.62 three-quarter as before');
  assert.ok(Math.abs(thetas[2] - (Math.PI / 2 + 0.62)) < 1e-9, 'side porch: turned a quarter to face the door wall');
});
