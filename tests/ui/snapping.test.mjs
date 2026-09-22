/* THE GUIDES THAT PLACE A WINDOW FOR YOU.
 *
 * Dragging used to be pointer-literal, so lining three windows up meant
 * nudging each one by eye until it looked right. snapDrag answers a different
 * question: given where the pointer is, where did they MEAN to put it?
 *
 * Four answers, in priority order — the wall's centre, the mirror of another
 * opening, an even-spacing slot, and (for height) another window's sill. The
 * order matters and is tested, because on a wall with two windows the centre
 * of the wall and the middle of the pair are usually the same place, and when
 * they are not, the wall's centre is what a customer means.
 *
 * Run: node --test tests/ui/snapping.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
c.scene = new c.THREE.Scene(); c.shedGroup = new c.THREE.Group(); c.scene.add(c.shedGroup);
Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12 });
c.buildShed = function(){};          // no 3D needed to answer "where does it go"

const win = (wall, pos, cy) => ({ wall, pos, w:24, h:36, cy, type:'White Vinyl 24x30' });
const setWindows = (list) => { c.windowsData = list; c.ventsData = []; c.doorsData = []; };

// ── EVEN SPACING ─────────────────────────────────────────────────────────

test('a row already evenly spaced offers the free even slot', () => {
  // Three windows across a wall sit at 1/4, 2/4, 3/4. Two are placed; the
  // third is being dragged near the middle.
  setWindows([win('front',0.25,52), win('front',0.75,52), win('front',0.60,52)]);
  const r = c.snapDrag('front','window',2, 0.52, 52);
  assert.equal(r.pos, 0.5, 'it lands on the middle slot');
  assert.equal(r.even, 'row', 'and says the whole row is even');
  /* Array.from, because the page runs inside a VM context: its arrays have
     that realm's Array prototype and deepStrictEqual compares prototypes, so a
     correct value fails a naive comparison. */
  assert.deepEqual(Array.from(r.evenSlots), [0.25, 0.5, 0.75], 'the guide can show every slot');
});

test('the fourth of four finds its slot even though it is also a mirror', () => {
  setWindows([win('front',0.2,52), win('front',0.4,52), win('front',0.6,52), win('front',0.55,52)]);
  const r = c.snapDrag('front','window',3, 0.79, 52);
  assert.equal(Math.round(r.pos*1000)/1000, 0.8);
  assert.equal(r.even, 'row', 'reported as the row guide, which shows all four slots');
});

test('windows placed by hand get the halfway offer, not a row that would be a lie', () => {
  /* 0.20 and 0.64 are not even slots for a row of three, so snapping to the
     free slot would leave a row that still is not even while a guide claimed
     it was. What IS true is that halfway between them the gaps match. */
  setWindows([win('front',0.20,52), win('front',0.64,52), win('front',0.40,52)]);
  const r = c.snapDrag('front','window',2, 0.425, 52);
  assert.equal(Math.round(r.pos*1000)/1000, 0.42, 'halfway between its neighbours');
  assert.equal(r.even, 'between');
  assert.equal(r.evenSlots, null, 'and no row guide, because the row is not even');
});

test('nowhere near an even position, nothing is forced', () => {
  setWindows([win('front',0.20,52), win('front',0.64,52), win('front',0.90,52)]);
  const r = c.snapDrag('front','window',2, 0.90, 52);
  assert.equal(r.pos, 0.90, 'the pointer is obeyed');
  assert.ok(!r.even, 'and no even guide is claimed');
});

test('two windows on a wall cannot produce a row offer', () => {
  // With one peer there is no "between", and a row of two is just the mirror.
  setWindows([win('front',0.3,52), win('front',0.62,52)]);
  const r = c.snapDrag('front','window',1, 0.62, 52);
  assert.ok(r.even !== 'between', 'nothing to be between');
});

// ── LEVELLING A SILL ─────────────────────────────────────────────────────

test('a wall with no windows levels against another wall', () => {
  setWindows([win('left',0.5,54), win('front',0.5,null)]);
  const r = c.snapDrag('front','window',1, 0.5, 56);
  assert.equal(r.cy, 54, 'it takes the other wall\'s sill height');
  assert.equal(r.cyFrom, 'left', 'and the guide can say where from');
});

test('a sill too far away is left alone', () => {
  setWindows([win('left',0.5,54), win('front',0.5,null)]);
  const r = c.snapDrag('front','window',1, 0.5, 70);
  assert.equal(r.cy, 70);
  assert.ok(!r.cyFrom, 'no borrowed guide');
});

test('this wall wins over another wall', () => {
  // Levelling against the window beside it beats one you cannot see at once.
  setWindows([win('left',0.5,54), win('front',0.2,48), win('front',0.8,null)]);
  const r = c.snapDrag('front','window',2, 0.8, 49);
  assert.equal(r.cy, 48);
  assert.ok(!r.cyFrom, 'a same-wall match is not a borrowed one');
});

test('the guide changes when the snap changes, so it gets rebuilt', () => {
  setWindows([win('front',0.25,52), win('front',0.75,52), win('front',0.60,52)]);
  const a = c.snapGuideFor('front', c.snapDrag('front','window',2, 0.52, 52));
  const b = c.snapGuideFor('front', c.snapDrag('front','window',2, 0.62, 52));
  assert.notEqual(c.snapGuideKey(a), c.snapGuideKey(b));
});

test('no snap means no guide at all', () => {
  setWindows([win('front',0.20,52), win('front',0.90,52)]);
  const sn = c.snapDrag('front','window',1, 0.90, 70);
  assert.equal(c.snapGuideFor('front', sn), null);
});

// ── TOLERANCE ────────────────────────────────────────────────────────────

test('the pull is the same few inches on a short wall and a long one', () => {
  // The FRONT wall's length is the shed's WIDTH, not its length — snapWallInches
  // picks per wall, and testing it by changing L would have tested nothing.
  const at = (W) => {
    c.W = W; setWindows([win('front',0.25,52), win('front',0.75,52), win('front',0.60,52)]);
    const off = 3 / (W*12);           // three inches, in this wall's own units
    return [c.snapDrag('front','window',2, 0.5+off*0.9, 52).pos,
            c.snapDrag('front','window',2, 0.5+off*1.6, 52).pos];
  };
  for (const W of [8, 12, 20]) {
    const [inside, outside] = at(W);
    assert.equal(inside, 0.5, `${W}ft wall: just inside three inches snaps`);
    assert.notEqual(outside, 0.5, `${W}ft wall: well outside does not`);
  }
  c.W = 12;
});
