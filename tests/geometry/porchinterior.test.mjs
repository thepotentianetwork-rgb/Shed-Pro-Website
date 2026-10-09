/* PARTIAL PORCH — THE ROOM INSIDE.
 *
 * Nando (9 Oct), on the inside of a partial porch: the notch's walls showed
 * the exterior siding inside the room. "Make changes to the inside too, move
 * the lights around if you have to, or get rid of them if you have to
 * depending on the variation."
 *  - the stepped-in wall and the returns carry the room's finish (OSB and
 *    studs, drywall, painted drywall), corners closed: from inside, nothing
 *    reaches the return boxes' siding;
 *  - the drywall ceiling stops at the notch, like the floor;
 *  - ceiling cans sit in the room, evenly, or are dropped;
 *  - a loft or shelf never runs out over the porch;
 *  - full-length porches and no porch: unchanged.
 *   node --test tests/geometry/porchinterior.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

function build(cfg, extra) {
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:4, SIDING:'vertical',
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:true, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_DECK:'pt',
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0, FOUNDATION:'blocks',
    INT_FINISH:'none', ELEC:'none', LOFT:'none', EDIT_MODE:false, selectedKind:'', selectedShelf:-1 }, cfg);
  c.doorsData.length = 0; c.windowsData.length = 0;
  c.shelvesData = (extra && extra.shelves) ? extra.shelves.map(s => Object.assign({}, s)) : [];
  c.SHOW_INTERIOR = c.LOFT !== 'none' || c.shelvesData.length > 0;
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const o = []; c.shedGroup.traverse(x => { if (x.isMesh && x.visible !== false) o.push(x); });
  return o;
}
const solid = m => m.filter(o => !(o.material && o.material.transparent && o.material.opacity < 0.2) && !o.userData.wallPick);
function first(meshes, from, dir) {
  const rc = new T.Raycaster(new T.Vector3(...from), new T.Vector3(...dir).normalize(), 0, 3);
  const h = rc.intersectObjects(meshes, false);
  return h[0] && h[0].point;
}
const FIN = ['none', 'drywall', 'painted'];
const VARIANTS = [
  ['front mid',    { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:6, PORCH_OFF:3 }],
  ['front corner', { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:6, PORCH_OFF:6 }],
  ['side mid',     { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:6 }],
  ['side corner',  { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 }],
];

test('from inside, the stepped-in wall, the returns and their corners are lined — no siding reached', () => {
  for (const fin of FIN) for (const [name, cfg] of VARIANTS) {
    const m = solid(build(Object.assign({ INT_FINISH:fin }, cfg)));
    const r = c.porchRect(); assert.ok(r, name);
    const side = r.wall === 'right';
    // world (along, across): front porch along=x, across=z (room at -z); side: along=z, across=x (room at -x)
    const P = (al, y, ac) => side ? [ac, y, al] : [al, y, ac];
    const D = (dal, dac) => side ? [dac, 0, dal] : [dal, 0, dac];
    const A = p => side ? p.z : p.x, C = p => side ? p.x : p.z;
    const inset = side ? r.x0 : r.z0, a0 = r.a0, a1 = r.a1, mid = (a0 + a1) / 2;
    for (const y of [0.3, 0.8, 1.4]) {
      // the porch's own door fills the middle of the stepped-in wall: test
      // either side of it, and above it
      // (at a shed corner the end is inside the outer wall's lining: test above the door)
      const ends = [r.atStart ? [a0 + 0.12, 1.5] : [a0 + 0.04, y], r.atEnd ? [a1 - 0.12, 1.5] : [a1 - 0.04, y]];
      for (const [al, yy] of ends.concat([[mid + 0.004, 1.5]])) {
        const hi = first(m, P(al, yy, inset - 0.6), D(0, 1));
        assert.ok(hi && C(hi) < inset - 0.025 - 0.01, `${fin} ${name}: stepped-in wall at ${al.toFixed(2)},y${yy} hit ${hi && C(hi)}`);
      }
      // the inside corner where a return meets the outer wall it stands in
      const outer = side ? c.W * 0.1 : c.L * 0.1;
      if (!r.atStart) {
        const q = first(m, P(a0 - 0.45, y, outer - 0.45), D(1, 1));
        assert.ok(q && A(q) < a0 - 0.06 && C(q) < outer - 0.03, `${fin} ${name}: start inside corner at y${y} hit ${q && [A(q).toFixed(3), C(q).toFixed(3)]}`);
      }
      if (!r.atEnd) {
        const q = first(m, P(a1 + 0.45, y, outer - 0.45), D(-1, 1));
        assert.ok(q && A(q) > a1 + 0.06 && C(q) < outer - 0.03, `${fin} ${name}: end inside corner at y${y} hit ${q && [A(q).toFixed(3), C(q).toFixed(3)]}`);
      }
      if (!r.atStart) {
        const h = first(m, P(a0 - 0.6, y, inset + 0.3), D(1, 0));
        assert.ok(h && A(h) < a0 - 0.05 - 0.01, `${fin} ${name}: start return at y${y} hit ${h && A(h)}`);
        const k = first(m, P(a0 - 0.4, y, inset - 0.4), D(1, 1));
        assert.ok(k && (A(k) < a0 - 0.06 || C(k) < inset - 0.035), `${fin} ${name}: start corner at y${y}`);
      }
      if (!r.atEnd) {
        const h = first(m, P(a1 + 0.6, y, inset + 0.3), D(-1, 0));
        assert.ok(h && A(h) > a1 + 0.05 + 0.01, `${fin} ${name}: end return at y${y} hit ${h && A(h)}`);
        const k = first(m, P(a1 + 0.4, y, inset - 0.4), D(-1, 1));
        assert.ok(k && (A(k) > a1 + 0.06 || C(k) < inset - 0.035), `${fin} ${name}: end corner at y${y}`);
      }
    }
  }
});

test('the drywall ceiling stops at the notch and still covers the room', () => {
  for (const [name, cfg] of VARIANTS) {
    const m = build(Object.assign({ INT_FINISH:'drywall' }, cfg));
    const r = c.porchRect(), w = c.W * 0.2, l = c.L * 0.2;
    const lids = m.filter(o => o.userData.drywallCeiling);
    assert.ok(lids.length >= 2, name);
    let area = 0;
    for (const o of lids) {
      const b = new T.Box3().setFromObject(o);
      area += (b.max.x - b.min.x) * (b.max.z - b.min.z);
      const ox = Math.min(b.max.x, r.x1) - Math.max(b.min.x, r.x0), oz = Math.min(b.max.z, r.z1) - Math.max(b.min.z, r.z0);
      assert.ok(ox <= 1e-6 || oz <= 1e-6, `${name}: lid over the notch`);
    }
    // the notch, out to the room faces of the walls round it (the stepped-in
    // wall is centred on its line, the returns stand outside it)
    const g = c.PORCH_ROOM_GAP, side = r.wall === 'right', A = side ? l : w, Cw = side ? w : l;
    const n0 = Math.max(-A / 2 + 0.01, r.a0 - (r.atStart ? 0 : 0.05 + g)), n1 = Math.min(A / 2 - 0.01, r.a1 + (r.atEnd ? 0 : 0.05 + g));
    const across = (Cw / 2 - 0.01) - ((side ? r.x0 : r.z0) - 0.025 - g);
    const want = (w - 0.02) * (l - 0.02) - (n1 - n0) * across;
    assert.ok(Math.abs(area - want) < 0.05, `${name}: lid area ${area} vs ${want}`);
  }
});

function cans(m) {
  return m.filter(o => o.geometry.type === 'CylinderGeometry' && Math.abs(o.geometry.parameters.radiusTop - 0.05) < 1e-6
    && o.material && o.material.emissive).map(o => ({ x: o.position.x, z: o.position.z }));
}
test('ceiling cans sit in the room, clear of the notch, evenly spaced, or are dropped', () => {
  const cases = VARIANTS.concat([
    ['side 14 mid', { PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:14, PORCH_OFF:1 }],
    ['small 8x8 front corner', { W:8, L:8, PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:4 }],
    ['small 8x8 side mid', { W:8, L:8, PORCH_LOC:'side', SIDE_PORCH:6, PORCH_LEN:4, PORCH_OFF:2 }],
  ]);
  for (const elec of ['basic', 'standard', 'core', 'essential']) for (const fin of ['none', 'drywall']) for (const [name, cfg] of cases) {
    const m = build(Object.assign({ ELEC:elec, INT_FINISH:fin }, cfg));
    const r = c.porchRect(), w = c.W * 0.2, l = c.L * 0.2, p = cans(m);
    const want = { basic:1, standard:2, core:4, essential:4 }[elec];
    assert.ok(p.length >= 1 && p.length <= want, `${elec} ${name}: ${p.length} cans`);
    for (const q of p) {
      assert.ok(Math.abs(q.x) < w / 2 - 0.1 && Math.abs(q.z) < l / 2 - 0.1, `${elec} ${name}: can off the room`);
      const inX = q.x > r.x0 - 0.1 && q.x < r.x1 + 0.1, inZ = q.z > r.z0 - 0.1 && q.z < r.z1 + 0.1;
      assert.ok(!(inX && inZ), `${elec} ${fin} ${name}: can at ${q.x.toFixed(3)},${q.z.toFixed(3)} over or against the notch`);
    }
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++)
      assert.ok(Math.hypot(p[i].x - p[j].x, p[i].z - p[j].z) >= 0.39, `${elec} ${name}: cans crowded`);
  }
});

test('no porch and full-length porches: the cans are where they always were', () => {
  const grid = (w, l) => [[-w / 4, -l / 4], [-w / 4, l / 4], [w / 4, -l / 4], [w / 4, l / 4]];
  for (const cfg of [{ PORCH_LOC:'none' }, { PORCH_LOC:'front', SIDE_PORCH:4 }, { PORCH_LOC:'side', SIDE_PORCH:4 }]) {
    const m = build(Object.assign({ ELEC:'core' }, cfg));
    const w = c.encWft() * 0.2, l = c.encLft() * 0.2;
    const p = cans(m).map(q => [+q.x.toFixed(4), +q.z.toFixed(4)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const g = grid(w, l).map(q => [+q[0].toFixed(4), +q[1].toFixed(4)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    assert.equal(JSON.stringify(p), JSON.stringify(g), JSON.stringify(cfg));
  }
});

test('a loft over a front porch notch is cut to the room; with no porch it is one deck as before', () => {
  let m = build({ LOFT:'4-front' });
  let decks = m.filter(o => o.userData.loftDeck);
  assert.equal(decks.length, 1);
  const b0 = new T.Box3().setFromObject(decks[0]);
  assert.ok(Math.abs((b0.max.x - b0.min.x) - (12 * 0.2 - 0.06)) < 1e-6);
  for (const [name, cfg] of [['front mid', VARIANTS[0][1]], ['front corner', VARIANTS[1][1]], ['side mid', VARIANTS[2][1]]]) {
    for (const lf of ['4-front', '8-dual', '6-back']) {
      m = build(Object.assign({ LOFT:lf }, cfg));
      const r = c.porchRect();
      decks = m.filter(o => o.userData.loftDeck);
      assert.ok(decks.length >= 1, `${name} ${lf}: some loft`);
      for (const d of decks) {
        const b = new T.Box3().setFromObject(d);
        const ox = Math.min(b.max.x, r.x1 + 0.05) - Math.max(b.min.x, r.x0 - 0.05), oz = Math.min(b.max.z, r.z1 + 0.05) - Math.max(b.min.z, r.z0 - 0.05);
        assert.ok(ox <= 1e-6 || oz <= 1e-6, `${name} ${lf}: loft deck runs over the notch`);
      }
    }
  }
});

test('shelves stay on wall: on the stepped-in wall between the returns, none in an open corner', () => {
  const shelfGroups = () => { const g = []; c.shedGroup.traverse(o => { if (o.userData && o.userData.isShelf) g.push(o); }); return g; };
  build(VARIANTS[0][1], { shelves:[{ wall:'front', pos:0.5, cy:48, depth:16, len:10 }] });
  let r = c.porchRect(), g = shelfGroups();
  assert.equal(g.length, 1);
  const b = new T.Box3().setFromObject(g[0]);
  assert.ok(b.min.x >= r.x0 + 0.05 && b.max.x <= r.x1 - 0.05, `shelf ${b.min.x}..${b.max.x} vs porch ${r.x0}..${r.x1}`);
  assert.ok(b.max.z < r.z0, 'shelf hangs on the stepped-in wall, inside the room');
  // a right-end front corner porch: a shelf in the middle of the right wall's gap has no wall
  build(VARIANTS[1][1], { shelves:[{ wall:'right', pos:0.05, cy:48, depth:16, len:3 }] });
  r = c.porchRect(); g = shelfGroups();
  for (const s of g) { const bb = new T.Box3().setFromObject(s); assert.ok(bb.max.z <= r.z0 + 1e-6, 'shelf out in the open corner'); }
});
