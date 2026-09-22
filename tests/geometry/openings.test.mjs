/* DOORS, VENTS, AND THE SIDING AROUND THEM.
 *
 * Four faults, all the same shape: two bits of code each held their own copy
 * of where an opening's edge is, and the copies disagreed.
 *
 *   1. The arched leaf was inset 0.012 from its opening; the siding infill cut
 *      its hole at 0.004. So the hole was 0.008 bigger than the door all the
 *      way round and you could see through the shed down both sides of it.
 *   2. The fairytale arch trim reaches 4.7in past the leaf, but the batten
 *      pass was cut to the wall opening — the leaf — so board & batten ran its
 *      strips straight over the arch, 3/4in proud of an 0.018 board.
 *   3. A vent's casing is 3.3in wide; the batten pass cleared only the 16in
 *      louvre inside it, so battens crossed in front of the trim boards.
 *   4. A "gable vent" sat a foot BELOW the wall plate, in the wall rather than
 *      on the gable, and the gable's own rise was computed to the wall
 *      centreline instead of its face.
 *
 * These tests fire rays and read world-space bounds. They do not re-read the
 * numbers that placed the meshes, because that is precisely what was wrong.
 *
 * Run: node --test tests/geometry/openings.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from './harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const INCH = 0.2 / 12;

function build(cfg) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    doorsData:[], windowsData:[], ventsData:[], shelvesData:[] }, cfg);
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return meshes(c);
}
const objsOf = () => { const o=[]; c.shedGroup.traverse(x=>{if(x.isMesh)o.push(x);}); return o; };

// Wall battens are parented to shedGroup; door and vent parts live in their
// own groups, which is what tells them apart.
function wallBattens(m, zWall) {
  return m.filter(x => x.obj.parent === c.shedGroup
    && x.min.z > zWall - 0.004 && (x.max.z - x.min.z) < 0.02
    && (x.max.x - x.min.x) < 0.09 && (x.max.y - x.min.y) > 0.05);
}
function partsOf(m, flag) {
  return m.filter(x => { let p = x.obj; while (p) { if (p.userData && p.userData[flag]) return true; p = p.parent; } return false; });
}

// ── 1. THE ARCHED DOOR IS NOT A HOLE IN THE WALL ─────────────────────────

for (const SIDING of ['vertical', 'board-batten', 'horizontal']) {
  for (const dw of [30, 36, 42]) {
    test(`no daylight around the fairytale door — ${SIDING}, ${dw}in`, () => {
      build({ SIDING, doorsData:[{wall:'front', pos:0.5, w:dw, h:76, style:'fairytale', color:'white'}] });
      const objs = objsOf();
      const lift = c.shedGroup.position.y, zWall = c.encLft()*0.2/2 + 0.025;
      const half = dw*INCH/2 + 0.06;
      const through = [];
      for (let x = -half; x <= half; x += 0.007)
        for (let y = lift + 0.02; y <= lift + 76*INCH + 0.06; y += 0.007) {
          const rc = new T.Raycaster(new T.Vector3(x, y, zWall + 0.6), new T.Vector3(0,0,-1), 0, 6);
          if (!rc.intersectObjects(objs, false).some(v => v.point.z > zWall - 0.10))
            through.push([+x.toFixed(3), +y.toFixed(3)]);
        }
      assert.equal(through.length, 0,
        `${through.length} rays pass straight through the wall at the door; first few: ` +
        JSON.stringify(through.slice(0,4)));
    });
  }
}

// ── 2. BATTENS CLEAR THE ARCH TRIM ───────────────────────────────────────

for (const style of ['fairytale', 'cedar', 'res6']) {
  test(`board & batten keeps off the door trim — ${style}`, () => {
    const m = build({ SIDING:'board-batten',
      doorsData:[{wall:'front', pos:0.5, w:36, h:76, style, color:'white'}] });
    const lift = c.shedGroup.position.y, zWall = c.encLft()*0.2/2 + 0.025;
    const dw = 36*INCH, dh = Math.min(76*INCH, c.H*0.2 - 0.12);
    const reach = style === 'fairytale' ? c.ftTrimReach() : 0;
    const clear = dw/2 + reach, topClear = dh + reach;
    const over = wallBattens(m, zWall).filter(b => {
      const bc = (b.min.x + b.max.x)/2;
      return Math.abs(bc) < clear - 0.001
          && (b.min.y - lift) < topClear - 0.001 && (b.max.y - lift) > 0.001;
    });
    assert.equal(over.length, 0,
      `${over.length} battens cross the door trim: ` +
      JSON.stringify(over.slice(0,3).map(b => ({ x:+((b.min.x+b.max.x)/2).toFixed(3),
        y0:+(b.min.y-lift).toFixed(3), y1:+(b.max.y-lift).toFixed(3) }))));
  });
}

// ── 3. A VENT IS DEAD CENTRE ON ITS GABLE ────────────────────────────────

for (const [W, L, H, PITCH] of [[12,20,9,6], [8,12,8,4], [16,24,10,10], [10,16,7,8]]) {
  test(`a new gable vent centres on the gable — ${W}x${L}, ${H}ft walls, ${PITCH}/12`, () => {
    const m = build({ W, L, H, PITCH, ventsData:[{wall:'front', pos:0.5, cy:null}] });
    const lift = c.shedGroup.position.y, h = H*0.2;
    const v = partsOf(m, 'isVent');
    assert.ok(v.length, 'the vent is built');
    const vx = (Math.min(...v.map(p=>p.min.x)) + Math.max(...v.map(p=>p.max.x))) / 2;
    const vy = (Math.min(...v.map(p=>p.min.y)) + Math.max(...v.map(p=>p.max.y))) / 2;
    const ridgeY = c.gableRoof().ridgeY + lift;
    const mid = (h + lift + ridgeY) / 2;
    assert.ok(Math.abs(vx) < 1e-6, `horizontally centred (x = ${vx.toFixed(5)})`);
    assert.ok(vy > h + lift, 'it is ON the gable, not down in the wall');

    /* Dead centre — unless the triangle is too tight for it there. A gable
       narrows as it climbs, and on a small shallow-pitched shed the casing
       will not fit at half height; the vent then sits as high as it does fit.
       Work out which case this is from the geometry rather than exempting
       particular sizes, so a real regression in the common case still fails. */
    const halfBase = c.encWft()*0.2/2 + 0.025;
    const rise = c.gableRoof().ridgeY - h;
    const vHalfW = (Math.max(...v.map(p=>p.max.x)) - Math.min(...v.map(p=>p.min.x))) / 2;
    const vHalfH = (Math.max(...v.map(p=>p.max.y)) - Math.min(...v.map(p=>p.min.y))) / 2;
    const fitsCentred = halfBase * (1 - (rise/2 + vHalfH) / rise) >= vHalfW;
    if (fitsCentred) {
      assert.ok(Math.abs(vy - mid) < 0.004,
        `vertically centred: vent ${vy.toFixed(4)} vs triangle middle ${mid.toFixed(4)} ` +
        `(${((vy-mid)/INCH).toFixed(2)} in out)`);
    } else {
      assert.ok(vy < mid, 'too tight to centre, so it sits lower');
      const above = (Math.max(...v.map(p=>p.max.y)) - lift) - h;
      assert.ok(halfBase * (1 - above/rise) >= vHalfW - 1e-6,
        'and wherever it ended up, the casing is inside the rake');
    }
  });
}

test('a vent the gable has no room for drops into the wall rather than through the rake', () => {
  // A steep narrow gable can be too tight at half height. The fallback has to
  // be a vent that still fits the building, not one poking out of the roof.
  const m = build({ W:6, L:10, H:8, PITCH:12, ventsData:[{wall:'front', pos:0.5, cy:null}] });
  const lift = c.shedGroup.position.y;
  const v = partsOf(m, 'isVent');
  const top = Math.max(...v.map(p => p.max.y)) - lift;
  const halfBase = c.encWft()*0.2/2 + 0.025;
  const rise = c.gableRoof().ridgeY - c.H*0.2;
  const above = Math.max(0, top - c.H*0.2);
  const halfThere = halfBase * (1 - above/rise);
  const vHalf = (Math.max(...v.map(p=>p.max.x)) - Math.min(...v.map(p=>p.min.x))) / 2;
  assert.ok(vHalf <= halfThere + 1e-6,
    `the vent (half ${vHalf.toFixed(3)}) fits the gable width at its top (${halfThere.toFixed(3)})`);
});

// ── 4. THE VENT WEARS THE SHED'S TRIM, AND THE SIDING KEEPS OFF IT ───────

test('a vent has a casing the same width as a window casing', () => {
  const m = build({ ventsData:[{wall:'front', pos:0.5, cy:null}] });
  const v = partsOf(m, 'isVent');
  const w = Math.max(...v.map(p=>p.max.x)) - Math.min(...v.map(p=>p.min.x));
  const hgt = Math.max(...v.map(p=>p.max.y)) - Math.min(...v.map(p=>p.min.y));
  assert.ok(Math.abs(w - (16*INCH + c.VENT_CASE*2)) < 1e-6, `16in louvre plus a casing each side (${w.toFixed(4)})`);
  assert.ok(Math.abs(hgt - (8*INCH + c.VENT_CASE*2)) < 1e-6, `8in louvre plus a casing top and bottom (${hgt.toFixed(4)})`);
  assert.ok(c.VENT_CASE >= 0.05, 'and the casing is a board, not a lip');
});

test('nothing on the vent is buried in the siding', () => {
  const m = build({ ventsData:[{wall:'front', pos:0.5, cy:null}] });
  const zWall = c.encLft()*0.2/2 + 0.025;
  const v = partsOf(m, 'isVent');
  const back = Math.min(...v.map(p => p.min.z));
  assert.ok(back >= zWall - 1e-6,
    `the vent starts at the wall face or outside it (${back.toFixed(4)} vs ${zWall.toFixed(4)})`);
});

for (const wall of ['front', 'left']) {
  test(`board & batten keeps off the vent casing — ${wall} wall`, () => {
    const m = build({ SIDING:'board-batten', ventsData:[{wall, pos:0.5, cy:null}] });
    const zWall = wall === 'front' ? c.encLft()*0.2/2 + 0.025 : c.encWft()*0.2/2 + 0.025;
    const v = partsOf(m, 'isVent');
    const vb = { x0:Math.min(...v.map(p=>p.min.x)), x1:Math.max(...v.map(p=>p.max.x)),
                 y0:Math.min(...v.map(p=>p.min.y)), y1:Math.max(...v.map(p=>p.max.y)),
                 z0:Math.min(...v.map(p=>p.min.z)), z1:Math.max(...v.map(p=>p.max.z)) };
    const bats = m.filter(x => x.obj.parent === c.shedGroup && (x.max.x-x.min.x) < 0.09
      && (x.max.y-x.min.y) > 0.05 && (x.max.z-x.min.z) < 0.02);
    const over = bats.filter(b => !(b.max.x < vb.x0 || b.min.x > vb.x1)
                               && !(b.max.y < vb.y0 || b.min.y > vb.y1)
                               && !(b.max.z < vb.z0 || b.min.z > vb.z1));
    assert.equal(over.length, 0, `${over.length} battens run across the vent casing`);
  });
}
