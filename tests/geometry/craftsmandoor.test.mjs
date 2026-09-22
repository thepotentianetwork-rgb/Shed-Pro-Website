/* THE CRAFTSMAN DOOR, against the reference photo in docs/craftsman-door.md.
 *
 * These tests were first written from the STYLE rather than from the photo:
 * three lites over a projecting dentil shelf with blocks beneath it. That is
 * a correct description of a textbook Craftsman entry door and it is not the
 * door being copied, so the tests passed on a door that did not match. They
 * now check the reference, feature by feature:
 *
 *   1. A head cap ABOVE the glass — the projecting piece is over the lites,
 *      not under them.
 *   2. FOUR lites, so three muntins.
 *   3. A plain rail under the glass. Nothing hangs off it.
 *   4. Two tall panels over a bottom rail deeper than the rails above it.
 *   5. Short strap hinges that stay beside the glass, not the full-size barn
 *      strap that reached a third of the way across the leaf.
 *
 * Each is checked as geometry — glass up top, a part standing proud of the
 * trim plane, bars over the panes — rather than by counting meshes, which a
 * three-panel door would also pass.
 *
 * Run: node --test tests/geometry/craftsmandoor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const INCH = 0.2/12;

function build(style, w) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    windowsData:[], ventsData:[], shelvesData:[], ADDONS:{},
    doorsData:[{ wall:'front', pos:0.5, w:w||36, h:80, style, color:'white' }] });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return meshes(c);
}
const doorParts = (m) => m.filter(x => { let p=x.obj; while(p){ if(p.userData&&p.userData.isDoor) return true; p=p.parent; } return false; });
function doorBox(parts) {
  return { x0:Math.min(...parts.map(v=>v.min.x)), x1:Math.max(...parts.map(v=>v.max.x)),
           y0:Math.min(...parts.map(v=>v.min.y)), y1:Math.max(...parts.map(v=>v.max.y)),
           z1:Math.max(...parts.map(v=>v.max.z)) };
}
// Glass is the only thing on the door built as a PlaneGeometry.
const glassOf = (parts) => parts.filter(x => x.type === 'PlaneGeometry');

test('the top of the door is glazed', () => {
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const glass = glassOf(parts);
  assert.ok(glass.length, 'there is glass on the door at all');
  const top = Math.max(...glass.map(g => g.max.y));
  const h = b.y1 - b.y0;
  assert.ok(top > b.y0 + h * 0.7, `the glass is up at the top (${((top-b.y0)/h*100).toFixed(0)}% up the door)`);
});

test('the glass is divided into four lites, not left as one pane', () => {
  /* The divisions are what makes it Craftsman rather than a lite-over-panel
     door, so this counts the muntins crossing the glass band. FOUR panes:
     the reference has four and this was built with three. */
  const parts = doorParts(build('craftsman'));
  const glass = glassOf(parts);
  const gTop = Math.max(...glass.map(g => g.max.y));
  const gBot = Math.min(...glass.map(g => g.min.y));
  const gMid = (gTop + gBot) / 2;
  const gx0 = Math.min(...glass.map(g => g.min.x));
  const gx1 = Math.max(...glass.map(g => g.max.x));
  const band = gTop - gBot;
  /* A muntin is as tall as the GLASS BAND and no taller. Without the upper
     bound the door's own full-height stiles pass too — they cross the band's
     middle and are just as narrow — and the count comes out at six. */
  const muntins = parts.filter(x => x.type === 'BoxGeometry'
    && x.min.y < gMid && x.max.y > gMid
    && (x.max.y - x.min.y) > band * 0.6 && (x.max.y - x.min.y) < band * 1.3
    && (x.max.x - x.min.x) < 0.05
    && x.min.x > gx0 - 0.01 && x.max.x < gx1 + 0.01);
  assert.equal(muntins.length, 3, `three muntins make four lites (found ${muntins.length})`);
  // Measured against the GLASS, which is what they divide — not the door box,
  // which includes the casing and the stiles outside it.
  const xs = muntins.map(mn => (mn.min.x + mn.max.x) / 2).sort((p, q) => p - q);
  const quarter = (gx1 - gx0) / 4;
  for (let i = 1; i < xs.length; i++) {
    assert.ok(Math.abs((xs[i] - xs[i - 1]) - quarter) < quarter * 0.15,
      `evenly spaced across the glass (${(xs[i]-xs[i-1]).toFixed(4)} apart, a quarter is ${quarter.toFixed(4)})`);
  }
  assert.ok(Math.abs((xs[0] + xs[xs.length - 1]) / 2 - (gx0 + gx1) / 2) < 0.005, 'and centred');
});

test('the head cap projects from the face, above the glass', () => {
  /* The part a line cannot do. Anything at the trim plane is a line, and a
     line is what the door already had before any of this.

     The side it is on is half the test. A textbook Craftsman shelf sits UNDER
     the lites; in the reference the projecting piece is over them, and the
     first version put it under — so the one part standing off the face stood
     off it in the wrong place. */
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const trim = parts.filter(x => x.type === 'BoxGeometry' && (x.max.x - x.min.x) > 0.2);
  const faces = trim.map(x => x.max.z).sort((p, q) => q - p);
  const proud = faces[0] - faces[faces.length - 1];
  assert.ok(proud > 0.015,
    `something wide stands clear of the trim plane by ${(proud/INCH).toFixed(1)}in`);
  const glass = glassOf(parts);
  const gTop = Math.max(...glass.map(g => g.max.y));
  const gBot = Math.min(...glass.map(g => g.min.y));
  const cap = trim.filter(x => Math.abs(x.max.z - faces[0]) < 1e-6)[0];
  assert.ok(cap.min.y >= gTop - 0.01,
    `the cap is above the glass (cap bottom ${cap.min.y.toFixed(3)}, glass top ${gTop.toFixed(3)})`);
  assert.ok(cap.max.y < b.y1, 'and still on the door, under the head trim');
  // It spans the leaf, not just the opening — in the reference it runs past
  // the glass to both stiles.
  const gW = Math.max(...glass.map(g => g.max.x)) - Math.min(...glass.map(g => g.min.x));
  assert.ok((cap.max.x - cap.min.x) > gW * 1.2,
    `and runs wider than the glass (${((cap.max.x-cap.min.x)/INCH).toFixed(1)}in against ${(gW/INCH).toFixed(1)}in)`);
  assert.ok(gBot > b.y0, 'sanity: the glass is a band, not the whole door');
});

test('the rail under the glass is plain, and the bottom rail is the deep one', () => {
  /* The correction, stated as geometry. The first version hung a row of
     dentil blocks off the rail beneath the lites; the reference has nothing
     there, and instead carries its weight at the foot of the door, where the
     bottom rail is visibly deeper than the rails above it. */
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const glass = glassOf(parts);
  const gBot = Math.min(...glass.map(g => g.min.y));
  const gx0 = Math.min(...glass.map(g => g.min.x)), gx1 = Math.max(...glass.map(g => g.max.x));
  /* Confined to the leaf's clear width, so a hinge or a knob out on the
     casing is not mistaken for a block. */
  const blocks = parts.filter(x => x.type === 'BoxGeometry'
    && x.max.y < gBot && x.max.y > gBot - 0.06
    && (x.max.x - x.min.x) < 0.09 && (x.max.y - x.min.y) < 0.03
    && x.min.x > gx0 && x.max.x < gx1);
  assert.equal(blocks.length, 0,
    `nothing hangs off the rail under the glass (found ${blocks.length})`);

  // Full-width rails on the leaf, by height.
  const rails = parts.filter(x => x.type === 'BoxGeometry'
    && (x.max.x - x.min.x) > (gx1 - gx0) * 0.9
    && (x.max.y - x.min.y) < 0.06 && x.max.y < gBot);
  assert.ok(rails.length >= 2, `there are rails below the glass (found ${rails.length})`);
  const lowest = rails.reduce((a, r) => (r.min.y < a.min.y ? r : a));
  const others = rails.filter(r => r !== lowest);
  const deepest = Math.max(...others.map(r => r.max.y - r.min.y));
  assert.ok((lowest.max.y - lowest.min.y) > deepest,
    `the bottom rail is the deepest (${((lowest.max.y-lowest.min.y)/INCH).toFixed(2)}in ` +
    `against ${(deepest/INCH).toFixed(2)}in)`);
  assert.ok(lowest.min.y < b.y0 + (b.y1 - b.y0) * 0.2, 'and it is at the foot of the door');
});

test('the panels below are split in two', () => {
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const lowMid = b.y0 + (b.y1 - b.y0) * 0.3;
  const centre = (b.x0 + b.x1) / 2;
  const mullion = parts.filter(x => x.type === 'BoxGeometry'
    && x.min.y < lowMid && x.max.y > lowMid
    && (x.max.x - x.min.x) < 0.05
    && Math.abs((x.min.x + x.max.x) / 2 - centre) < 0.02);
  assert.ok(mullion.length >= 1, 'a centre mullion divides the lower half');
});

test('you can see INTO the shed through the lites', () => {
  /* The point of the glass, and what was wrong after the first attempt: the
     lites were drawn, divided and lit, over a leaf that was still a solid
     slab. glassRegion returned null for this door, so nothing was ever cut.
     A pane you cannot see through is a painted rectangle.

     Glass is transparent, so "blocked" means an OPAQUE thing stopped the ray,
     not any thing at all. */
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const objs = []; c.shedGroup.traverse(x => { if (x.isMesh) objs.push(x); });
  const zWall = c.encLft()*0.2/2 + 0.025;
  const opaque = (hit) => {
    const mt = hit.object.material;
    return !(mt && mt.transparent === true && (mt.opacity || 1) < 0.6);
  };
  const glass = glassOf(parts);
  const gy0 = Math.min(...glass.map(g => g.min.y)), gy1 = Math.max(...glass.map(g => g.max.y));
  const gx0 = Math.min(...glass.map(g => g.min.x)), gx1 = Math.max(...glass.map(g => g.max.x));
  let through = 0, tot = 0;
  for (let x = gx0 + 0.01; x < gx1 - 0.01; x += 0.006)
    for (let y = gy0 + 0.01; y < gy1 - 0.01; y += 0.006) {
      tot++;
      const rc = new T.Raycaster(new T.Vector3(x, y, zWall + 0.6), new T.Vector3(0,0,-1), 0, 6);
      if (!rc.intersectObjects(objs, false).filter(h => h.point.z > zWall - 0.12).some(opaque)) through++;
    }
  assert.ok(through > tot * 0.5,
    `most of the glass sees through (${through} of ${tot} rays)`);

  // And the rest of the door does not, or it is not a door.
  const below = b.y0 + (gy0 - b.y0) * 0.5;
  const rc = new T.Raycaster(new T.Vector3(0, below, zWall + 0.6), new T.Vector3(0,0,-1), 0, 6);
  assert.ok(rc.intersectObjects(objs, false).filter(h => h.point.z > zWall - 0.12).some(opaque),
    'the panel below the glass is solid');
});

test('the muntins sit on the glass, not beside it', () => {
  // The opening is narrower than the trim frame's clear width, so muntins
  // spaced across the FRAME land off the lites. Both now read one stile width.
  const parts = doorParts(build('craftsman'));
  const glass = glassOf(parts);
  const gx0 = Math.min(...glass.map(g => g.min.x)), gx1 = Math.max(...glass.map(g => g.max.x));
  const gy = (Math.min(...glass.map(g => g.min.y)) + Math.max(...glass.map(g => g.max.y))) / 2;
  const bars = parts.filter(x => x.type === 'BoxGeometry'
    && x.min.y < gy && x.max.y > gy && (x.max.x - x.min.x) < 0.05
    && x.min.x > gx0 - 0.01 && x.max.x < gx1 + 0.01
    && (x.max.y - x.min.y) < (gx1 - gx0) * 3);
  for (const bar of bars) {
    assert.ok(bar.min.x > gx0 && bar.max.x < gx1,
      `a bar at ${((bar.min.x+bar.max.x)/2).toFixed(3)} is inside the glass ${gx0.toFixed(3)}..${gx1.toFixed(3)}`);
  }
});

/* NO HARDWARE ACROSS THE GLASS — on any glazed door, not just this one.
 *
 * hingeYs already walks the leaf, subtracts the glazed band and spreads the
 * hinges over what is left. What it cannot do is subtract a band nobody told
 * it about: while glassRegion returned null for the Craftsman door, the whole
 * leaf counted as solid and the top hinge landed straight across the lites at
 * 70in. The cedar door had had exactly this bug before, which is why hingeYs
 * exists — and it came back the moment a new glazed style was added without a
 * glassRegion entry.
 *
 * So this is written against every glazed style rather than the one that was
 * reported, because the next new glazed door will be added the same way. */
for (const [style, w] of [['craftsman',36], ['craftsman',60], ['cedar',36], ['cedar',60],
                          ['reshalf',36], ['resfull',36]]) {
  test(`no hinge or handle crosses the glass — ${style}, ${w}in`, () => {
    const parts = doorParts(build(style, w));
    const glass = glassOf(parts);
    assert.ok(glass.length, `${style} is glazed`);
    // Hardware is the dark metal on the door; the leaf and trim are not.
    const dark = parts.filter(x => {
      const mt = x.obj.material;
      return x.type !== 'PlaneGeometry' && mt && mt.color
          && mt.color.r < 0.25 && mt.color.g < 0.25 && mt.color.b < 0.25;
    });
    const over = dark.filter(h => glass.some(g =>
      h.max.y > g.min.y && h.min.y < g.max.y && h.max.x > g.min.x && h.min.x < g.max.x));
    assert.equal(over.length, 0,
      `${over.length} pieces of hardware sit over a pane: ` +
      JSON.stringify(over.slice(0,3).map(h => ({
        y0:+h.min.y.toFixed(3), y1:+h.max.y.toFixed(3),
        x0:+h.min.x.toFixed(3), x1:+h.max.x.toFixed(3) }))));
  });
}

test('every style with a glazed band declares it, so hingeYs can dodge it', () => {
  /* The root cause, stated directly. A door whose leaf is cut for glass but
     whose glassRegion says null is the exact shape of the bug: the opening
     exists, and everything that asks "where is the glass" gets told nothing. */
  for (const style of ['craftsman', 'cedar', 'reshalf', 'resfull']) {
    const parts = doorParts(build(style, 36));
    const glass = glassOf(parts);
    if (!glass.length) continue;
    const b = doorBox(parts);
    const gy0 = Math.min(...glass.map(g => g.min.y));
    const gy1 = Math.max(...glass.map(g => g.max.y));
    // The leaf must actually be open there: a slab behind the pane would mean
    // the glass is decoration and the band is not a band.
    const slabs = parts.filter(x => x.type === 'BoxGeometry' && (x.max.z - x.min.z) > 0.045);
    const behind = slabs.filter(sl => sl.min.y < gy1 - 0.01 && sl.max.y > gy0 + 0.01
      && sl.min.x < 0 && sl.max.x > 0);
    assert.equal(behind.length, 0,
      `${style}: nothing solid sits behind the glass (found ${behind.length})`);
  }
});

test('the strap hinges are short ones, not barn straps', () => {
  /* It was in the shed-door family at full strap size: about nine inches of
     iron reaching a third of the way across the leaf and over the panels.

     The reference has straps too — the species was right and this test was
     first written to replace them with butt hinges, which would have been a
     different door again. What is wrong is the SIZE, so that is what this
     measures: REACH from the leaf edge, because a barn strap is not a bigger
     hinge, it is a hinge that crosses the door. At the old scale it reaches
     11.8in and the glass starts at 9.3in. */
  const parts = doorParts(build('craftsman'));
  const glass = glassOf(parts);
  const gx0 = Math.min(...glass.map(g => g.min.x));
  const stileEdge = Math.min(...parts.filter(x => x.type === 'BoxGeometry'
    && (x.max.y - x.min.y) > 0.5).map(x => x.min.x));        // the leaf's own edge
  const hw = parts.filter(x => {
    const mt = x.obj.material;
    return x.type !== 'PlaneGeometry' && mt && mt.color
        && mt.color.r < 0.25 && mt.color.g < 0.25 && mt.color.b < 0.25
        && (x.max.x - x.min.x) < 0.2 && (x.max.y - x.min.y) < 0.2;
  });
  assert.ok(hw.length, 'there is hardware on the door at all');
  const reach = Math.max(...hw.map(h => h.max.x - stileEdge));
  assert.ok(reach < (gx0 - stileEdge) * 1.2,
    `no piece of hardware crosses onto the panels (reaches ${(reach/INCH).toFixed(1)}in ` +
    `from the leaf edge; the glass starts at ${((gx0-stileEdge)/INCH).toFixed(1)}in)`);
});

test('it no longer looks like the plain door', () => {
  // The old craftsman was a frame and two rails, which is what 'basic' already
  // is plus lines. If these two ever converge again, something has been undone.
  const craft = doorParts(build('craftsman'));
  const basic = doorParts(build('basic'));
  assert.ok(glassOf(craft).length > glassOf(basic).length, 'only one of them is glazed');
  /* Not a part count. Swapping the strap hinges for butt hinges took a dozen
     meshes off the door while making it MORE like the reference, so a count
     would have called that a regression. What separates it from the plain
     door is the features: glass, bars over the glass, and something standing
     off the face. */
  const wide = (ps) => ps.filter(x => x.type === 'BoxGeometry' && (x.max.x - x.min.x) > 0.2);
  const relief = (ps) => { const f = wide(ps).map(x => x.max.z); return Math.max(...f) - Math.min(...f); };
  assert.ok(relief(craft) > 0.015 && relief(craft) > relief(basic) + 0.01,
    `the craftsman has a part standing off its face and the plain door does not ` +
    `(${(relief(craft)/INCH).toFixed(1)}in against ${(relief(basic)/INCH).toFixed(1)}in)`);
  const g = glassOf(craft);
  const gy = (Math.min(...g.map(v => v.min.y)) + Math.max(...g.map(v => v.max.y))) / 2;
  const gx0 = Math.min(...g.map(v => v.min.x)), gx1 = Math.max(...g.map(v => v.max.x));
  const bars = craft.filter(x => x.type === 'BoxGeometry' && x.min.y < gy && x.max.y > gy
    && (x.max.x - x.min.x) < 0.05 && x.min.x > gx0 && x.max.x < gx1);
  assert.ok(bars.length >= 3, `and its glass is divided (${bars.length} bars)`);
});

test('it holds together on a wide leaf as well as a narrow one', () => {
  for (const w of [30, 36, 48, 60]) {
    const parts = doorParts(build('craftsman', w));
    const b = doorBox(parts);
    const glass = glassOf(parts);
    assert.ok(glass.length, `${w}in: still glazed`);
    const gBot = Math.min(...glass.map(g => g.min.y));
    assert.ok(gBot > b.y0 + (b.y1 - b.y0) * 0.55,
      `${w}in: the glass stays a band at the top, not half the door`);
  }
});
