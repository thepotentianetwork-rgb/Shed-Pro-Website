/* THE BI-FOLD BAR WINDOW — three panels that accordion, not one that swings.
 *
 * The brief was explicit about the failure to avoid: "Do not simply rotate all
 * three panels together." That failure is invisible in every cheap check. A
 * window built as one slab on one hinge still has three panels, still has
 * glass, still clears the opening when open and still fills it when shut. The
 * only thing that gives it away is that the three panels share a rotation and
 * stay in one plane — so that is what these tests look at.
 *
 *   1. CLOSED, the three panels tile the opening edge to edge and lie in one
 *      plane. A gap or an overlap here is a window you can see daylight
 *      through when it is shut.
 *   2. OPEN, each panel has its OWN pivot angle, and they are not all equal.
 *      This is the accordion, stated as the thing a single-hinge build fails.
 *   3. OPEN, the panels are stacked face to face at one jamb — a compact group
 *      a few inches across, perpendicular to the wall — not fanned across the
 *      opening.
 *   4. OPEN, the opening is clear across nearly its whole width. Measured off
 *      the panels' real bounds, so a stack that quietly grew would fail.
 *   5. The panels do not stack INSIDE one another. Folded, all three pivots
 *      collapse to one point, so a missing separation offset puts three panels
 *      in one plane — geometry that renders as a flicker and reads as one
 *      panel. The gaps are checked against the panel's own thickness.
 *   6. Fold Left and Fold Right are mirror images, and each stacks at the jamb
 *      it names.
 *   7. No shutters and no flower boxes. Both are offered on "a window", and a
 *      matte-black architectural bi-fold with board-and-batten shutters and a
 *      planter hanging off the bar is not a product.
 *   8. The bar ledge is under the opening, deep enough to serve off, wider
 *      than the opening, and BELOW the panels' swing — a ledge the open
 *      window passes through is worse than no ledge.
 *
 * Run: node --test tests/geometry/bifold.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const IN = 0.2 / 12;

const KEY = 'Black Bi-Fold Bar 72x42';
const WIN_W = 72, WIN_H = 42;
const OPENING = WIN_W * IN;                 // the hole in the wall, world units

function build(over) {
  const o = Object.assign({}, over || {});
  const addons = o.__addons || {}; delete o.__addons;
  if (o.__type) { o.type = o.__type; delete o.__type; }
  const wd = Object.assign({ wall: 'front', pos: 0.5, w: WIN_W, h: WIN_H, cy: 62,
                             type: KEY, open: false, fold: 'left', ledge: true }, o);
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'', WALLS_XRAY:false,
    doorsData:[], ventsData:[], shelvesData:[], ADDONS:addons, windowsData:[wd] });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return wd;
}

/* The panels, found by the tag the builder puts on them — not by guessing which
   boxes look like a panel. Each comes back with its world bounds and the angle
   of the pivot carrying it, which is the whole subject of tests 2 and 3. */
function panels(over) {
  build(over);
  const out = [];
  c.shedGroup.traverse((o) => {
    if (!o.userData || o.userData.bifoldPanel == null) return;
    const b = new T.Box3().setFromObject(o);
    out.push({ i: o.userData.bifoldPanel, min: b.min.clone(), max: b.max.clone(),
               cx: (b.min.x + b.max.x) / 2, ry: o.parent.rotation.y });
  });
  return out.sort((a, b) => a.i - b.i);
}
// Everything built for this window, for the ledge tests.
function winParts(over) {
  build(over);
  return meshes(c).filter((x) => { let p = x.obj; while (p) { if (p.userData && p.userData.isWindow) return true; p = p.parent; } return false; });
}
const deg = (r) => Math.round(r * 180 / Math.PI);

test('closed, the three panels tile the opening edge to edge', () => {
  const p = panels({ open: false });
  assert.equal(p.length, 3, `expected 3 panels, got ${p.length}`);
  const byX = p.slice().sort((a, b) => a.cx - b.cx);

  // They span the full opening...
  assert.ok(Math.abs((byX[2].max.x - byX[0].min.x) - OPENING) < 0.5 * IN,
    `closed width ${((byX[2].max.x - byX[0].min.x) / IN).toFixed(1)}" should be the ${WIN_W}" opening`);
  // ...and meet, with neither a gap to see through nor an overlap.
  for (let i = 1; i < 3; i++) {
    const gap = byX[i].min.x - byX[i - 1].max.x;
    assert.ok(Math.abs(gap) < 0.4 * IN, `panels ${i - 1}/${i} meet: gap ${(gap / IN).toFixed(2)}"`);
  }
  // One plane. A shut window whose panels sit at three depths is not shut.
  const depths = p.map((x) => x.min.z);
  assert.ok(Math.max(...depths) - Math.min(...depths) < 0.3 * IN,
    'closed panels should be coplanar');
});

test('open, each panel turns on its own pivot — not all together', () => {
  const p = panels({ open: true });
  const angles = p.map((x) => deg(x.ry));
  // THE test for this window. One hinge for the lot gives three equal angles.
  assert.equal(new Set(angles).size, 3,
    `the three panels share pivot angles ${angles.join('/')} — that is one slab on one hinge, not an accordion`);
  // Panel 0 swings the chain out of the opening; the two behind it fold back
  // on themselves, which is what a half-turn relative to the parent means.
  assert.equal(Math.abs(deg(p[0].ry)), 90, 'the first panel should swing a quarter turn out of the opening');
  for (const i of [1, 2]) {
    assert.equal(Math.abs(deg(p[i].ry)), 180, `panel ${i} should fold back on the one before it`);
  }
  // And the two fold-backs go opposite ways, or the chain is a spiral.
  assert.ok(Math.sign(p[1].ry) !== Math.sign(p[2].ry), 'the fold-backs should alternate');
});

test('open, the panels stack face to face at one jamb', () => {
  const p = panels({ open: true, fold: 'left' });
  // Perpendicular to the wall: each panel is deep and narrow, not wide and flat.
  for (const q of p) {
    const wide = q.max.x - q.min.x, deepz = q.max.z - q.min.z;
    assert.ok(deepz > wide * 3, `panel ${q.i} is not perpendicular to the wall (${(wide/IN).toFixed(1)}" across, ${(deepz/IN).toFixed(1)}" deep)`);
  }
  // A compact group, not a fan: the whole stack is a handful of inches across.
  const lo = Math.min(...p.map((q) => q.min.x)), hi = Math.max(...p.map((q) => q.max.x));
  const stackIn = (hi - lo) / IN;
  assert.ok(stackIn < 10, `the folded stack is ${stackIn.toFixed(1)}" across — that is a fan, not a stack`);
  // Sitting at the LEFT jamb it hinges on.
  assert.ok(Math.abs(lo - (-OPENING / 2)) < 1 * IN,
    `the stack should sit at the left jamb (${(lo / IN).toFixed(1)}" vs ${(-OPENING / 2 / IN).toFixed(1)}")`);
});

test('open, the opening is clear across nearly its whole width', () => {
  const p = panels({ open: true, fold: 'left' });
  const stackEdge = Math.max(...p.map((q) => q.max.x));
  const clear = (OPENING / 2) - stackEdge;              // jamb-side edge to the far jamb
  const pct = clear / OPENING;
  assert.ok(pct > 0.85, `only ${(pct * 100).toFixed(0)}% of the opening is clear when open`);
  // And closed it is NOT — otherwise the measurement above proves nothing.
  const shut = panels({ open: false });
  const shutEdge = Math.max(...shut.map((q) => q.max.x));
  assert.ok((OPENING / 2) - shutEdge < 0.05 * OPENING, 'a closed bi-fold should fill its opening');
});

test('open, the panels do not stack inside one another', () => {
  const p = panels({ open: true }).slice().sort((a, b) => a.cx - b.cx);
  const thick = Math.min(...p.map((q) => q.max.x - q.min.x));   // one bare panel
  /* Overlap of the real BOUNDS, not distance between centres. Centres lie
     about this one: the lead panel carries a pull handle, so its box is wider
     than a panel and its centre is not where the panel is. It was also the
     handle, not the panel, that reached into its neighbour the first time —
     a centre-to-centre check would have called that clear. */
  for (let i = 1; i < p.length; i++) {
    const overlap = p[i - 1].max.x - p[i].min.x;
    assert.ok(overlap <= 0.01 * IN,
      `folded panels ${i - 1} and ${i} overlap by ${(overlap / IN).toFixed(2)}" — `
      + `they intersect (a panel is ${(thick / IN).toFixed(2)}" thick)`);
  }
  // The separation is the builder's own table, so a test cannot pass by
  // agreeing with a number nobody set.
  assert.equal(c.BIFOLD_STACK_OFFSETS.length, 3);
});

test('fold left and fold right are mirror images', () => {
  const L = panels({ open: true, fold: 'left' });
  const R = panels({ open: true, fold: 'right' });
  assert.ok(Math.max(...R.map((q) => q.max.x)) > 0, 'folding right should stack at the right jamb');
  assert.ok(Math.min(...L.map((q) => q.min.x)) < 0, 'folding left should stack at the left jamb');
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(L[i].cx + R[i].cx) < 0.3 * IN,
      `panel ${i} is not mirrored: ${(L[i].cx / IN).toFixed(2)}" vs ${(R[i].cx / IN).toFixed(2)}"`);
    assert.equal(deg(L[i].ry), -deg(R[i].ry), `panel ${i} pivot is not mirrored`);
  }
});

test('the bar ledge serves the opening and the panels clear it', () => {
  const on = winParts({ ledge: true });
  const off = winParts({ ledge: false });
  // The ledge is the one part standing well out from the wall and lying flat.
  const flatOut = (parts) => parts.filter((v) =>
    (v.max.z - v.min.z) > 10 * IN && (v.max.y - v.min.y) < 4 * IN);
  const ledges = flatOut(on);
  assert.equal(ledges.length, 1, `expected exactly one bar ledge, found ${ledges.length}`);
  assert.equal(flatOut(off).length, 0, 'ledge Off should build no ledge');

  /* A design saved before the ledge field existed has no `ledge` on it at all,
     and must still get one — the ledge is what makes this a BAR window. Only an
     explicit Off turns it off, so the default is checked against an absent
     field rather than against `true`, which every other case here passes. */
  const noField = winParts({ ledge: undefined });
  assert.equal(flatOut(noField).length, 1,
    'a bi-fold with no ledge field saved on it lost its bar ledge');

  const L = ledges[0];
  const deep = (L.max.z - L.min.z) / IN;
  assert.ok(deep >= 12 && deep <= 16, `ledge is ${deep.toFixed(1)}" deep — the spec says 12-16"`);
  assert.ok((L.max.x - L.min.x) > OPENING, 'the ledge should be wider than the opening');

  // BELOW the panels, at both ends of the fold — an open window that sweeps
  // through its own counter is the failure worth a test here.
  for (const open of [false, true]) {
    const p = panels({ open, ledge: true });
    const lowest = Math.min(...p.map((q) => q.min.y));
    assert.ok(L.max.y <= lowest + 0.001,
      `${open ? 'open' : 'closed'}: the ledge top (${L.max.y.toFixed(3)}) runs into the panels (${lowest.toFixed(3)})`);
  }
});

test('a premium window takes no shutters and no flower boxes', () => {
  const dressed = { shutters: true, flowerboxes: true };
  const bifold = winParts({ __addons: dressed });
  // Flower boxes are the only spheres on a window; shutters are the only
  // boards standing outside the casing. Both are asked of the geometry, so a
  // rename of the addon keys cannot make this pass vacuously.
  const spheres = (parts) => parts.filter((v) => v.type === 'SphereGeometry').length;
  /* A shutter is a TALL board standing clear of the casing, measured against
     the window it is on. Two things make that fiddly and both bit here: the
     bar ledge is deliberately wider than the opening too (so "outside the
     casing" alone counts it as a shutter), and the control window is half the
     width of the bi-fold (so a threshold taken from the bi-fold's opening
     put the control's shutters comfortably inside it, and the test reported
     that shutters were never built at all). Both bounds come off the window
     under test. */
  const shutters = (parts, wIn, hIn) => parts.filter((v) =>
    Math.min(Math.abs(v.min.x), Math.abs(v.max.x)) > (wIn / 2 + 3) * IN &&
    (v.max.y - v.min.y) > hIn * IN / 2).length;

  assert.equal(spheres(bifold), 0, 'the bi-fold grew a flower box');
  assert.equal(shutters(bifold, WIN_W, WIN_H), 0, 'the bi-fold grew shutters');

  // The same shed with an ordinary window DOES get both — otherwise the two
  // counts above are zero because the addons never ran at all.
  const plain = winParts({ __addons: dressed, __type: 'Black Vinyl 36x36', w: 36, h: 36, cy: 52 });
  assert.ok(spheres(plain) > 0, 'flower boxes are not being built on any window');
  assert.ok(shutters(plain, 36, 36) > 0, 'shutters are not being built on any window');
});
