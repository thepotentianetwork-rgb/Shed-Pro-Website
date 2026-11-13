/* LEAN-TO LOFT AT THE LOW WALL (Nando pt1747u, 13 Nov 2026).
 *
 * On every lean-to the loft starts at the LOW wall and runs level toward the
 * high wall; the customer only picks a depth. Before this every loft rode 6in
 * under the TALL wall's plate, so a "Back Gable" or side-wall loft stood above
 * the low wall and out through the roof.
 *
 * Checked by measuring the built meshes and by firing rays at the shell:
 *   - the deck is level, against the low wall, as deep as picked
 *   - nothing of the loft is above the roof, the rafters or the low wall
 *   - the outside of the shed is ray-for-ray identical with and without a loft
 *   - drop change / reversed slope / old saved values re-place it
 *   - a gable loft is exactly where it always was
 *
 * Run: node --test tests/geometry/leantoloft.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
c.showToast = () => {};
const IN = 0.2 / 12;

function build(cfg) {
  Object.assign(c, { STYLE: 'leanto', W: 10, L: 12, H: 8, PITCH: 6, LEANTO_DROP: 1, LEANTO_FRONT_OVH: 'match',
    INSIDE_VIEW: false, WALLS_XRAY: false, INT_FINISH: 'none', ELEC: 'none', OVTYPE: 'all4', OVH: 4,
    ROOFTYPE: 'metal', SIDING: 'vertical', PORCH_LOC: 'none', SIDE_PORCH: 0, EDIT_MODE: false, selectedKind: '',
    doorsData: [{ wall: 'front', pos: 0.5, style: 'basic', w: 60, h: 76 }],
    windowsData: [], ventsData: [], shelvesData: [], LOFT: 'none', LOFT_SIDE: 'ends', LEANTO_LOFT_MSG: '' }, cfg);
  c.SHOW_INTERIOR = c.LOFT !== 'none';
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  // Bounds in the shed's own frame: the group rides FOUNDATION_LIFT on blocks.
  const lift = c.shedGroup.position.y;
  return meshes(c).map(m => { m.min.y -= lift; m.max.y -= lift; return m; });
}
const deckOf = (ms) => ms.filter(m => m.obj.userData.loftDeck);
const loftParts = (ms) => {
  // deck, joists, rim and ledger share the deck's two materials
  const mats = new Set(); deckOf(ms).forEach(m => mats.add(m.obj.material));
  return ms.filter(m => m.obj.userData.loftDeck || m.obj.userData.loftLedger ||
    (m.obj.material && m.obj.material.color && [0xb08d5a].includes(m.obj.material.color.getHex()) && !m.obj.isInstancedMesh));
};

/* What a customer sees from outside: rays from above and from all four sides. */
function silhouette() {
  const objs = []; c.shedGroup.traverse(o => { if (o.isMesh) objs.push(o); });
  const rc = new T.Raycaster(); const out = [];
  const shoot = (o, d) => { rc.set(o, d); rc.near = 0; rc.far = 200; const h = rc.intersectObjects(objs, false)[0];
    out.push(h ? +h.distance.toFixed(5) : null); };
  for (let x = -1.2; x <= 1.2; x += 0.15) for (let z = -1.4; z <= 1.4; z += 0.15) shoot(new T.Vector3(x, 20, z), new T.Vector3(0, -1, 0));
  for (let y = 0.1; y <= 1.9; y += 0.1) for (let a = -1.2; a <= 1.2; a += 0.15) {
    shoot(new T.Vector3(a, y, 20), new T.Vector3(0, 0, -1)); shoot(new T.Vector3(a, y, -20), new T.Vector3(0, 0, 1));
    shoot(new T.Vector3(20, y, a), new T.Vector3(-1, 0, 0)); shoot(new T.Vector3(-20, y, a), new T.Vector3(1, 0, 0));
  }
  return out;
}

const SIZES = [[10, 12, 8], [12, 16, 10], [8, 8, 8], [16, 10, 9]];
for (const [W, L, H] of SIZES) for (const drop of [1, 2]) for (const d of [2, 4, 8, 12]) {
  test(`${W}x${L}, ${H}ft walls, ${drop}ft drop, ${d}ft loft: level, at the low wall, under the roof`, () => {
    const ms = build({ W, L, H, LEANTO_DROP: drop, LOFT: d + '-front' });
    const want = Math.min(d, L);   // full depth allowed (pt1756u)
    assert.equal(c.LOFT, want + '-back', 'mapped to the low (back) wall');
    assert.equal(c.LOFT_SIDE, 'ends');
    const decks = deckOf(ms); assert.ok(decks.length >= 1, 'a deck is built');
    const l = L * 0.2, h = H * 0.2, back = h - drop * 0.2;
    for (const m of decks) {
      assert.ok(Math.abs(m.obj.rotation.x) < 1e-9 && Math.abs(m.obj.rotation.z) < 1e-9, 'deck is level');
      assert.ok(m.max.y - m.min.y < 0.051, 'deck has no slope in it');
      assert.ok(Math.abs(m.min.z - (-l / 2 + 0.03)) < 0.005, `starts at the low wall (z0 ${m.min.z})`);
      assert.ok(Math.abs((m.max.z - m.min.z) - Math.min(want * 0.2, l - 0.1)) < 0.005, 'as deep as picked, measured from the low wall');
      assert.ok(m.max.y <= back - 0.075 + 1e-6, 'top below the low wall plate');
    }
    // no loft part above the roof plane or within the clearance of the rafters
    for (const m of loftParts(ms)) {
      for (const z of [m.min.z, m.max.z]) {
        const roof = c.leantoRoofYAt(z);
        assert.ok(m.max.y < roof - (c.LEANTO_RAFTER_BELOW_ROOF) + 1e-6, `loft part under the rafters at z=${z.toFixed(3)}`);
      }
    }
    // straight up from the deck, the first thing hit is the rafters/deck of the roof, not air past a wall
    const objs = []; c.shedGroup.traverse(o => { if (o.isMesh && !o.userData.loftDeck) objs.push(o); });
    const d0 = decks[0];
    for (const z of [d0.min.z + 0.02, (d0.min.z + d0.max.z) / 2, d0.max.z - 0.02]) {
      const rc = new T.Raycaster(new T.Vector3(0.013, d0.max.y + 0.001, z), new T.Vector3(0, 1, 0), 0, 5);
      const hit = rc.intersectObjects(objs, false)[0];
      assert.ok(hit, 'something overhead');
      assert.ok(hit.distance >= c.LEANTO_LOFT_CLEAR_IN * IN - 0.003, `clearance over the deck ${(hit.distance / IN).toFixed(2)}in`);
    }
  });
}

test('adding or removing a loft never changes the outside of the shed (roof, walls, trim)', () => {
  for (const drop of [1, 2]) for (const [W, L] of [[10, 12], [12, 16]]) {
    build({ W, L, LEANTO_DROP: drop }); const none = silhouette();
    for (const v of ['4-back', '8-front', '6-dual']) {
      build({ W, L, LEANTO_DROP: drop, LOFT: v }); const withLoft = silhouette();
      assert.deepEqual(withLoft, none, `outside unchanged with loft ${v}, drop ${drop}`);
    }
    for (const side of ['ends', 'sides']) {
      build({ W, L, LEANTO_DROP: drop, LOFT: '12-back', LOFT_SIDE: side });
      build({ W, L, LEANTO_DROP: drop, LOFT: 'none' });
      assert.deepEqual(silhouette(), none, 'removing it puts the shed back exactly');
    }
  }
});

test('roof drop change re-places the loft under the new low wall', () => {
  const y1 = deckOf(build({ LOFT: '4-back', LEANTO_DROP: 1 }))[0].max.y;
  const y2 = deckOf(build({ LOFT: '4-back', LEANTO_DROP: 2 }))[0].max.y;
  assert.ok(Math.abs((y1 - y2) - 0.2) < 0.002, 'drops with the low wall, a foot (less the steeper rafters)');
});

test('reversed slope (back wall taller): the loft moves to the front, now the low wall', () => {
  const ms = build({ LOFT: '4-back', LEANTO_DROP: -1 });
  assert.equal(c.leantoLowWall(), 'front');
  assert.equal(c.LOFT, '4-front');
  const dk = deckOf(ms)[0], l = 12 * 0.2;
  assert.ok(Math.abs(dk.max.z - (l / 2 - 0.03)) < 0.005, 'against the front wall');
  assert.ok(dk.max.y <= 8 * 0.2 - 0.075 + 1e-6, 'under the front (now low) wall plate');
});

test('older saved lean-to designs map onto the low wall', () => {
  const cases = [
    [{ loft: '4-front', loftSide: 'ends' }, '4-back'],
    [{ loft: '6-back', loftSide: 'ends' }, '6-back'],
    [{ loft: '4-dual', loftSide: 'ends' }, '8-back'],     // same floor area
    [{ loft: '4-back', loftSide: 'sides' }, '4-back'],
    [{ loft: '2-dual', loftSide: 'sides' }, '4-back'],
    [{ loft: '12-back', loftSide: 'ends' }, '12-back'],   // all the way across a 12ft-deep shed
    [{ loft: '10-dual', loftSide: 'ends' }, '12-back'],   // 20ft of dual: cut to the full depth
  ];
  for (const [cfg, want] of cases) {
    build({}); const base = c.getDesignConfig();
    c.applyDesignConfig(Object.assign({}, base, { style: 'leanto', w: 10, l: 12, h: 8 }, cfg));
    assert.equal(c.LOFT, want, JSON.stringify(cfg)); assert.equal(c.LOFT_SIDE, 'ends');
    const saved = c.getDesignConfig();
    assert.equal(saved.loft, want); assert.equal(saved.loftSide, 'ends');
  }
});

test('a loft deeper than the shed is set to the full depth, with a message; one that fits says nothing', () => {
  build({ L: 8, LOFT: '12-back' });
  assert.equal(c.LOFT, '8-back');
  assert.match(c.LEANTO_LOFT_MSG, /set to 8'/);
  build({ L: 12, LOFT: '12-back' });
  assert.equal(c.LOFT, '12-back');
  assert.equal(c.LEANTO_LOFT_MSG, '');
});

test('depth options run in 2ft steps up to the full depth', () => {
  for (const [L, want] of [[12, [2,4,6,8,10,12]], [16, [2,4,6,8,10,12,14,16]], [7, [2,4,6,7]], [6, [2,4,6]]]) {
    build({ L }); assert.deepEqual([...c.leantoLoftDepthOptions()], want, `L=${L}`);
  }
});

test('full-depth loft: reaches the high wall, stays level and under the roof everywhere', () => {
  for (const [L, H, drop] of [[12, 8, 1], [12, 8, 2], [16, 10, 2], [10, 7, 2]]) {
    const ms = build({ L, H, LEANTO_DROP: drop, LOFT: L + '-back' });
    assert.equal(c.LOFT, L + '-back');
    const l = L * 0.2, dk = deckOf(ms);
    assert.equal(dk.length, 1);
    assert.ok(dk[0].max.z > l / 2 - 0.1, 'runs to the high wall');
    for (const m of loftParts(ms)) for (const z of [m.min.z, m.max.z])
      assert.ok(m.max.y < c.leantoRoofYAt(z) - c.LEANTO_RAFTER_BELOW_ROOF + 1e-6, 'under the rafters');
  }
});

test('label: depth only, placement named from the walls', () => {
  build({ LOFT: '6-back', LEANTO_DROP: 2, H: 10 });
  assert.match(c.loftLabel(), /^6' deep, starts at the low \(back\) wall \(8'\) and runs level toward the 10' high wall, \d+' ?\d*"? headroom underneath$/);
  assert.equal(c.loftLabel().indexOf('Gable'), -1);
});

test('gable lofts are unchanged: 6in under the plate, front/back/dual and side walls as before', () => {
  for (const [v, side, n] of [['4-front', 'ends', 1], ['6-back', 'ends', 1], ['4-dual', 'ends', 2], ['4-back', 'sides', 1]]) {
    const ms = build({ STYLE: 'gable', W: 10, L: 12, H: 8, LOFT: v, LOFT_SIDE: side });
    assert.equal(c.LOFT, v); assert.equal(c.LOFT_SIDE, side);
    const decks = deckOf(ms); assert.equal(decks.length, n);
    for (const m of decks) assert.ok(Math.abs((m.min.y + m.max.y) / 2 - (8 * 0.2 - 0.10)) < 1e-6, 'h - 0.10');
  }
});

/* HEADROOM (Nando, 13 Nov 2026): the underside of the loft framing at 8ft off
   the floor wherever the roof allows it; otherwise as high as it fits under the
   rafters, with a notice. Measured with a ray from the joists down to the floor. */
function measuredHeadroomIn(ms) {
  const objs = []; c.shedGroup.traverse(o => { if (o.isMesh) objs.push(o); });
  const loft = loftParts(ms), lift = c.shedGroup.position.y;
  const under = Math.min(...loft.map(m => m.min.y));          // lowest loft framing, shed frame
  const dk = deckOf(ms)[0], z = (dk.min.z + dk.max.z) / 2;
  const hit = new T.Raycaster(new T.Vector3(0.013, under + lift - 0.001, z), new T.Vector3(0, -1, 0), 0, 5)
    .intersectObjects(objs.filter(o => !loft.some(m => m.obj === o)), false)[0];
  return { headroom: (hit.distance + 0.001) / IN, under };
}
for (const [H, drop, full] of [[8, 1, false], [9, 1, false], [10, 2, false], [10, 1, false], [11, 1, true], [12, 2, true], [12, 1, true]]) {
  test(`${H}ft high wall, ${drop}ft drop (low wall ${H - drop}ft): headroom ${full ? 'is 8ft' : 'as much as fits, with a notice'}`, () => {
    const ms = build({ W: 10, L: 12, H, LEANTO_DROP: drop, LOFT: '12-back' });
    assert.equal(c.LOFT, '12-back');
    const { headroom } = measuredHeadroomIn(ms), fit = c.leantoLoftFit();
    assert.equal(fit.full, full);
    if (full) assert.ok(Math.abs(headroom - 96) < 0.05, `8ft clear, got ${headroom.toFixed(2)}in`);
    else assert.ok(headroom < 96 && Math.abs(headroom - fit.headroomIn) < 0.05, `under 8ft, got ${headroom.toFixed(2)}in`);
    // never higher than 1.5in under the rafters at the low wall, and never above the roof anywhere
    for (const m of loftParts(ms)) for (const z of [m.min.z, m.max.z])
      assert.ok(m.max.y < c.leantoRoofYAt(z) - c.LEANTO_RAFTER_BELOW_ROOF + 1e-6);
    const label = c.loftLabel();
    assert.match(label, /headroom underneath$/);
  });
}

test('the loft never goes up past 8ft headroom just because the roof is tall', () => {
  const lo = measuredHeadroomIn(build({ H: 11, LEANTO_DROP: 1, LOFT: '4-back' })).under;
  const hi = measuredHeadroomIn(build({ H: 12, LEANTO_DROP: 1, LOFT: '4-back' })).under;
  assert.ok(Math.abs(lo - hi) < 1e-9, 'same 8ft underside on an 11ft and a 12ft wall');
});

test('a loft that cannot fit at all is refused with a message', () => {
  const keep = c.LEANTO_LOFT_MIN_HEADROOM_IN;
  c.LEANTO_LOFT_MIN_HEADROOM_IN = 200;                   // nothing fits
  try {
    build({ LOFT: '6-back' });
    assert.equal(c.LOFT, 'none');
    assert.match(c.LEANTO_LOFT_MSG, /will not fit/);
    assert.equal(deckOf(meshes(c)).length, 0);
  } finally { c.LEANTO_LOFT_MIN_HEADROOM_IN = keep; }
});
