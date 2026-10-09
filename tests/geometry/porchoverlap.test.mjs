/* PARTIAL PORCH — INSIDE AND OUTSIDE NEVER OVERLAP.
 *
 * Nando (9 Oct), on Annie's porch: "let's make sure the interior and exterior
 * aren't overlapping. I see a hint of white popping out of the left wall of
 * the porch." The front wall's drywall ended exactly on the return wall's
 * porch-side face, coplanar with its siding, and flickered through.
 *
 * Every mesh the interior builds (linings, framing, reveals, floor, ceiling,
 * lights, loft, shelves) is collected as it is built and its bounding box must
 * stay out of the porch: the notch's open volume AND the walls round it from
 * their room faces outwards. Every finish, every porch position.
 *   node --test tests/geometry/porchoverlap.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);

// record what the interior builders add
let inside = [];
for (const fn of ['buildInterior', 'buildShelves', 'buildFloor']) {
  const orig = c[fn];
  c[fn] = function () {
    const before = new Set(c.shedGroup.children);
    const r = orig.apply(this, arguments);
    for (const ch of c.shedGroup.children) if (!before.has(ch)) inside.push(ch);
    return r;
  };
}

function build(cfg, extra) {
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:4, SIDING:'vertical',
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:true, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_DECK:'pt',
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0, FOUNDATION:'blocks',
    INT_FINISH:'none', ELEC:'core', LOFT:'none', EDIT_MODE:false, selectedKind:'', selectedShelf:-1, FLOOR_TIER:'standard' }, cfg);
  c.doorsData.length = 0; c.windowsData.length = 0;
  ((extra && extra.doors) || []).forEach(d => c.doorsData.push(Object.assign({}, d)));
  ((extra && extra.windows) || []).forEach(d => c.windowsData.push(Object.assign({}, d)));
  c.shelvesData = ((extra && extra.shelves) || []).map(s => Object.assign({}, s));
  c.SHOW_INTERIOR = c.LOFT !== 'none' || c.shelvesData.length > 0;
  inside = [];
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const meshes = [];
  for (const g of inside) g.traverse(o => { if (o.isMesh && o.visible !== false) meshes.push(o); });
  return meshes;
}

const VARIANTS = [
  ['front mid',          { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:6, PORCH_OFF:3 }],
  ['front left corner',  { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:6, PORCH_OFF:0 }],
  ['front right corner', { PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:8 }],
  ['side mid',           { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:6 }],
  ['side back corner',   { PORCH_LOC:'side',  SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 }],
  ['side front corner',  { PORCH_LOC:'side',  SIDE_PORCH:6, PORCH_LEN:8, PORCH_OFF:8 }],
  ['annie-like 14x24',   { W:14, L:24, PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:10 }],
];
const EPS = 0.0005;

function violations(meshes) {
  const r = c.porchRect(), h = c.H * 0.2, w = c.W * 0.2, l = c.L * 0.2;
  const side = r.wall === 'right';
  // the forbidden porch block, in (along, across) terms: along the porch wall
  // from the returns' room faces, across from the stepped-in wall's room face out
  const al0 = r.atStart ? -1e9 : r.a0 - 0.05, al1 = r.atEnd ? 1e9 : r.a1 + 0.05;
  const ac0 = (side ? r.x0 : r.z0) - 0.025;
  const bad = [], bb = new T.Box3();
  // merged framing is one mesh of many boxes (24 vertices each, as a
  // BoxGeometry): test each member on its own
  const boxes = [];
  const per = new T.BoxGeometry(1, 1, 1).attributes.position.count, v = new T.Vector3();
  for (const m of meshes) {
    if (m.userData.framing) {
      const pa = m.geometry.attributes.position;
      for (let s0 = 0; s0 < pa.count; s0 += per) {
        const b = new T.Box3(), pts = [];
        for (let k = s0; k < s0 + per; k++) { v.fromBufferAttribute(pa, k).applyMatrix4(m.matrixWorld); b.expandByPoint(v); pts.push(v.clone()); }
        boxes.push([m, b, pts]);
      }
    } else boxes.push([m, new T.Box3().setFromObject(m)]);
  }
  const lift = c.shedGroup.position.y;              // the shed sits on its foundation
  const inPorch = (A, C, y) => y > EPS && y < h - 0.014 - EPS && A > al0 + EPS && A < al1 - EPS && C > ac0 + EPS;
  for (const [m, b0, pts] of boxes) {
    bb.copy(b0); bb.min.y -= lift; bb.max.y -= lift;
    if (bb.isEmpty()) continue;
    const A0 = side ? bb.min.z : bb.min.x, A1 = side ? bb.max.z : bb.max.x;
    const C1 = side ? bb.max.x : bb.max.z;
    if (pts && bb.max.y > h + EPS) {
      // roof framing slopes: its box spans the porch without the member
      // being in it — test the member's own corners, under the porch ceiling
      if (pts.some(p => inPorch(side ? p.z : p.x, side ? p.x : p.z, p.y - lift))) bad.push(['porch(roof)', m, bb.clone()]);
    } else {
      const yHit = bb.max.y > EPS && bb.min.y < h - 0.014 - EPS;
      if (yHit && A1 > al0 + EPS && A0 < al1 - EPS && C1 > ac0 + EPS) bad.push(['porch', m, bb.clone()]);
    }
    // and nothing past any outer wall's exterior face below the wall top
    if (bb.min.y < h - EPS && (bb.min.x < -w / 2 - 0.025 + EPS || bb.max.x > w / 2 + 0.025 - EPS ||
        bb.min.z < -l / 2 - 0.025 + EPS || bb.max.z > l / 2 + 0.025 - EPS)) bad.push(['outside', m, bb.clone()]);
  }
  return bad;
}
const fmt = b => `${b[0]} ${b[1].geometry.type} ${JSON.stringify(b[1].geometry.parameters || {}).slice(0, 70)} x${b[2].min.x.toFixed(3)}..${b[2].max.x.toFixed(3)} y${b[2].min.y.toFixed(3)}..${b[2].max.y.toFixed(3)} z${b[2].min.z.toFixed(3)}..${b[2].max.z.toFixed(3)}`;

for (const fin of ['none', 'drywall', 'painted']) {
  test(`${fin}: nothing built for the inside reaches into the porch or its walls' outer faces`, () => {
    const all = [];
    for (const [name, cfg] of VARIANTS) {
      const extra = fin === 'none'
        ? { shelves:[{ wall: cfg.PORCH_LOC === 'side' ? 'right' : 'front', pos:0.5, cy:48, depth:16, len:12 }] }
        : {};
      const lofts = fin === 'none' ? ['none', '4-front', '6-back'] : ['none'];
      for (const lf of lofts) {
        const m = build(Object.assign({ INT_FINISH:fin, LOFT:lf }, cfg), extra);
        assert.ok(m.length > 8, `${name}: interior collected (${m.length})`);
        for (const b of violations(m)) all.push(`${name} loft=${lf}: ${fmt(b)}`);
      }
    }
    assert.equal(all.length, 0, all.slice(0, 12).join('\n'));
  });
}

test('the porch ceiling is the soffit: same finish as the eaves, every option, every porch', () => {
  const porches = [['full front', { PORCH_LOC:'front', SIDE_PORCH:4 }], ['full side', { PORCH_LOC:'side', SIDE_PORCH:4 }]].concat(VARIANTS.slice(0, 4));
  for (const sf of ['match', 'white', 'black', 'cedar']) for (const [name, cfg] of porches) {
    const m = build(Object.assign({ SOFFIT:sf, INSIDE_VIEW:false, sc:0x5a7a9a }, cfg));
    const all = []; c.shedGroup.traverse(o => { if (o.isMesh) all.push(o); });
    const ceil = all.filter(o => o.material && o.material.userData && o.material.userData.porchCeiling);
    const eave = all.filter(o => o.material && o.material.userData && o.material.userData.eaveSoffit);
    assert.ok(ceil.length >= 1, `${sf} ${name}: porch ceiling found`);
    assert.ok(eave.length >= 1, `${sf} ${name}: eave soffit found`);
    const key = mt => JSON.stringify([mt.userData.soffitFinish, !!mt.map, mt.map ? null : mt.color.getHex(), mt.emissiveIntensity, mt.roughness]);
    for (const o of ceil) assert.equal(key(o.material), key(eave[0].material), `${sf} ${name}`);
    assert.equal(ceil[0].material.userData.soffitFinish, sf);
    if (sf === 'cedar') assert.ok(ceil[0].material.map, 'cedar boards'); else assert.equal(ceil[0].material.color.getHex(), c.soffitHex());
  }
});

test('a saved design carries its soffit to the porch ceiling', () => {
  for (const sf of ['white', 'black', 'cedar', 'match']) {
    build({ SOFFIT:sf, INSIDE_VIEW:false, PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:6, PORCH_OFF:3 });
    const saved = JSON.parse(JSON.stringify(c.getDesignConfig()));
    assert.equal(saved.soffit, sf);
    c.SOFFIT = 'match';
    const log = console.log; console.log = () => {};
    try { c.applyDesignConfig(saved); } finally { console.log = log; }
    assert.equal(c.SOFFIT, sf);
    c.__stubLights(); c.shedGroup.clear(); c.buildShed();
    const ceil = []; c.shedGroup.traverse(o => { if (o.isMesh && o.material && o.material.userData && o.material.userData.porchCeiling) ceil.push(o); });
    assert.ok(ceil.length && ceil.every(o => o.material.userData.soffitFinish === sf), sf);
  }
});
