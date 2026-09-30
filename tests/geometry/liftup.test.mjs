/* THE LIFT-UP BAR WINDOW — one sash, top-hinged, lifting to a canopy.
 *
 * The brief draws the line twice: this is NOT an awning window that cracks
 * open a few degrees, and it is NOT the bi-fold. Both of those are things a
 * wrong build looks like from the front, so the tests measure the mechanism:
 *
 *   1. Closed, one sash fills the opening flat against the wall. ONE — a
 *      three-panel build would also fill it.
 *   2. Open, the sash has rotated 85-90 degrees. An awning window at 20
 *      degrees passes "it moved"; only the angle catches it, and it is read
 *      off the sash's own shape rather than off the constant that set it.
 *   3. Open, the sash is a CANOPY: nearly horizontal, out over the counter,
 *      hanging from the top edge it was hinged on — not risen above it, which
 *      is what a sign error on the pivot produces, and not swung inward
 *      through the wall, which from outside looks shut.
 *   4. Open, the opening underneath is clear.
 *   5. Two gas struts, and they TRACK THE SASH. Parented to the sash or to the
 *      wall a strut swings rigidly and keeps its angle — the brief calls that
 *      out by name. So the angle is measured in both states and must differ,
 *      and the strut must still reach the sash in both.
 *   6. A gas strut extends. The rod stands out of its body when open.
 *   7. The bar ledge, and the panel clearing it.
 *
 * Everything is measured against other geometry rather than against absolute
 * coordinates: the shed sits up on its blocks, so world Y is the local figure
 * plus a foundation height, and comparing one to the other silently shifts
 * every expectation by a few inches.
 *
 * Run: node --test tests/geometry/liftup.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
c.doorsInit = true;                       // stop buildShed seeding a door over the window
const IN = 0.2 / 12;

const KEY = 'Black Lift-Up Bar 72x42';
const WIN_W = 72, WIN_H = 42, WIN_CY = 63;
const W = WIN_W * IN, H = WIN_H * IN;

function build(over) {
  const wd = Object.assign({ wall:'front', pos:0.5, w:WIN_W, h:WIN_H, cy:WIN_CY,
                             type:KEY, open:false, ledge:true }, over || {});
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'', WALLS_XRAY:false,
    doorsData:[], ventsData:[], shelvesData:[], ADDONS:{}, windowsData:[wd] });
  c.doorsInit = true;
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return wd;
}
const box = (o) => new T.Box3().setFromObject(o);
function tagged(key, value) {
  const out = [];
  c.shedGroup.traverse((o) => { if (o.userData && o.userData[key] === value) out.push(o); });
  return out;
}
function view(over) {
  build(over);
  const sashes = tagged('liftUpSash', true), hinges = tagged('liftUpHinge', true);
  assert.equal(sashes.length, 1, `expected ONE sash, found ${sashes.length}`);
  const hy = new T.Vector3(); hinges[0].getWorldPosition(hy);
  const frame = tagged('liftUpFrame', true);
  assert.ok(frame.length === 4, `expected a 4-sided fixed frame, found ${frame.length}`);
  const fb = frame.reduce((acc, o) => acc.union(box(o)), box(frame[0]));
  return {
    sash: box(sashes[0]),
    frame: fb,                      // the part that never moves: the opening itself
    hingeY: hy.y,
    rods: tagged('strut', 'rod').map(box),
    bodies: tagged('strut', 'body').map(box),
    parts: meshes(c).filter((x) => { let p = x.obj; while (p) { if (p.userData && p.userData.isWindow) return true; p = p.parent; } return false; })
  };
}
// The sash's tilt, read off the shape it actually occupies: a flat panel of
// known height, so how much of that height shows as rise and how much as
// reach gives the angle without asking the code what angle it used.
const sashAngleDeg = (s) => Math.round(Math.atan2(s.max.z - s.min.z, s.max.y - s.min.y) * 180 / Math.PI);

test('closed, one sash fills the opening flat against the wall', () => {
  const v = view({ open: false });
  const tall = v.sash.max.y - v.sash.min.y, deep = v.sash.max.z - v.sash.min.z;
  assert.ok(Math.abs(tall - H) < 0.5 * IN, `closed sash is ${(tall / IN).toFixed(1)}" tall, opening is ${WIN_H}"`);
  assert.ok(Math.abs((v.sash.max.x - v.sash.min.x) - W) < 0.5 * IN, 'closed sash should fill the width');
  assert.ok(deep < 4 * IN, `closed sash stands ${(deep / IN).toFixed(1)}" off the wall`);
  // Hanging from its top edge even when shut.
  assert.ok(Math.abs(v.sash.max.y - v.hingeY) < 1 * IN, 'the sash top should be the hinge line');
  /* And that edge is the TOP OF THE OPENING. Measured against the fixed frame,
     not against the hinge: a sash hung off the bottom edge is still flush with
     its own hinge, sits at the right size and reads as correct by every check
     above — it is just a full window-height too low, outside the hole it is
     supposed to fill. */
  assert.ok(Math.abs(v.sash.max.y - v.frame.max.y) < 3 * IN,
    `the sash hangs ${((v.frame.max.y - v.sash.max.y) / IN).toFixed(1)}" below the head of the opening`);
  assert.ok(v.sash.min.y > v.frame.min.y - 3 * IN, 'the closed sash drops below its own frame');
});

test('open, the sash has lifted 85-90 degrees, not cracked ajar', () => {
  const deg = sashAngleDeg(view({ open: true }).sash);
  assert.ok(deg >= 85 && deg <= 90, `the sash opened to ${deg} degrees — the brief asks for 85-90`);
  // And closed really is closed, so the reading above means something.
  assert.ok(sashAngleDeg(view({ open: false }).sash) <= 5, 'a shut sash should be upright');
});

test('open, the sash is a canopy over the counter, not a flag over the roof', () => {
  const v = view({ open: true });
  // Nearly horizontal: it reaches out about its own height and rises barely at all.
  assert.ok(v.sash.max.z - v.sash.min.z > H * 0.9, 'the open sash should reach out about its own height');
  assert.ok(v.sash.max.y - v.sash.min.y < H * 0.2, 'the open sash should be nearly flat');
  // OUT, not in. Rotating the pivot the other way swings it through the wall,
  // where from outside the shed it simply looks shut.
  const shut = view({ open: false }).sash;
  assert.ok(v.sash.max.z > shut.max.z + H * 0.5, 'the sash opened inward, through the wall');
  // Hanging FROM the head of the opening, not standing above it (the other
  // sign error) and not slung a height below it (a bottom-edge pivot).
  assert.ok(v.sash.min.y < v.frame.max.y + 2 * IN,
    `the open sash sits above the head of the opening (${((v.sash.min.y - v.frame.max.y) / IN).toFixed(1)}" up)`);
  assert.ok(v.sash.max.y > v.frame.max.y - 3 * IN,
    'the open sash is hinged below the head of the opening');
});

test('open, the opening underneath is clear', () => {
  const v = view({ open: true });
  const top = v.hingeY;                       // the head of the opening
  const clear = (v.sash.min.y - (top - H)) / H;
  assert.ok(clear > 0.85, `only ${(clear * 100).toFixed(0)}% of the opening height is clear`);
  // Closed it is NOT, or the measurement above proves nothing.
  const shut = view({ open: false });
  assert.ok((shut.sash.min.y - (shut.hingeY - H)) / H < 0.05, 'a closed sash should fill its opening');
});

test('two gas struts, and they swing with the sash', () => {
  const shut = view({ open: false }), open = view({ open: true });
  assert.equal(shut.rods.length, 2, `expected 2 struts, found ${shut.rods.length}`);
  assert.equal(open.rods.length, 2);
  // One each side.
  assert.ok(shut.rods.some((r) => r.max.x < 0) && shut.rods.some((r) => r.min.x > 0),
    'the struts should be one per side');

  /* THE POINT OF THIS WINDOW'S STRUTS. Parented to the sash or to the wall,
     a strut keeps its own angle and just gets carried around — which is what
     the brief says not to do, and which looks fine in a still. Its angle has
     to CHANGE between the two states. */
  const ang = (r) => Math.atan2(r.max.z - r.min.z, r.max.y - r.min.y) * 180 / Math.PI;
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(ang(open.rods[i]) - ang(shut.rods[i])) > 20,
      `strut ${i} is at the same angle open and shut (${ang(shut.rods[i]).toFixed(0)} vs ${ang(open.rods[i]).toFixed(0)}) — it is being carried, not driven`);
    // And it still REACHES the sash, rather than having been left behind.
    assert.ok(open.rods[i].max.z > open.sash.min.z - 2 * IN,
      `strut ${i} does not reach the open sash`);
  }
});

test('a gas strut extends — the rod stands out of its body', () => {
  const shut = view({ open: false }), open = view({ open: true });
  const len = (b) => Math.hypot(b.max.z - b.min.z, b.max.y - b.min.y);
  const rodOpen = len(open.rods[0]), rodShut = len(shut.rods[0]);
  assert.ok(rodOpen > rodShut * 1.5,
    `the strut barely changed length (${(rodShut / IN).toFixed(1)}" -> ${(rodOpen / IN).toFixed(1)}") — it is not telescoping`);
  // The body is the fixed part, so the rod must stand proud of it when open.
  assert.equal(open.bodies.length, 2);
  assert.ok(rodOpen > len(open.bodies[0]) * 1.2, 'the rod is swallowed by its own body when open');
});

test('the bar ledge is there, and the sash clears it', () => {
  const flatOut = (parts) => parts.filter((v) =>
    (v.max.z - v.min.z) > 10 * IN && (v.max.y - v.min.y) < 4 * IN);
  assert.equal(flatOut(view({ ledge: true }).parts).length, 1, 'no bar ledge');
  assert.equal(flatOut(view({ ledge: false }).parts).length, 0, 'ledge Off still built one');
  assert.equal(flatOut(view({ ledge: undefined }).parts).length, 1,
    'a design saved with no ledge field lost its bar ledge');

  const L = flatOut(view({ ledge: true }).parts)[0];
  const deep = (L.max.z - L.min.z) / IN;
  assert.ok(deep >= 12 && deep <= 16, `ledge is ${deep.toFixed(1)}" deep — the spec says 12-16"`);
  assert.ok((L.max.x - L.min.x) > W, 'the ledge should be wider than the opening');
  for (const open of [false, true]) {
    const v = view({ open, ledge: true });
    assert.ok(L.max.y <= v.sash.min.y + 0.001,
      `${open ? 'open' : 'closed'}: the ledge runs into the sash`);
  }
});
