/* HOW DEEP A PORCH MAY GO, AND WHEN IT MAY GO THERE.
 *
 * The porch comes OUT of the footprint — a 10ft front porch on a 16ft shed
 * leaves a 6ft room — so every depth is gated on what is left. Two separate
 * places in designer.html carry the ladder of depths: the picker, which
 * decides what to OFFER, and clampPorch, which decides what to KEEP when the
 * shed is resized. If those two disagree, the designer offers a depth and
 * then silently takes it away, which reads as the tap not registering.
 *
 * Run: node --test tests/ui/porch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

/* Both ladders, read out of the page rather than written here — a test that
   carried its own copy would pass while the two in the file drifted. */
function ladders() {
  const picker = /var depthOptions=\[([\d,\s]+)\]/.exec(HTML);
  const clamp = /var fits=\[([\d,\s]+)\]\.filter/.exec(HTML);
  assert.ok(picker, 'depthOptions has moved or been renamed');
  assert.ok(clamp, 'the clampPorch ladder has moved or been renamed');
  const nums = (m) => m[1].split(',').map((n) => Number(n.trim()));
  return { picker: nums(picker), clamp: nums(clamp) };
}

test('the two depth ladders agree', () => {
  const { picker, clamp } = ladders();
  assert.deepEqual(picker, clamp,
    'the picker offers ' + picker.join(',') + ' but the clamp keeps ' + clamp.join(','));
});

test('the ladder runs shallow to deep, in even feet', () => {
  const { picker } = ladders();
  assert.deepEqual(picker, picker.slice().sort((a, b) => a - b), picker.join(','));
  picker.forEach((d) => assert.equal(d % 2, 0, d + 'ft is not an even number of feet'));
  assert.ok(picker.includes(10), 'the deepest porch should be 10ft: ' + picker.join(','));
});

// ── what fits ──────────────────────────────────────────────────────────────

test('a porch is measured against the run it eats into', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.W = 12; c.L = 20;
  /* Front eats LENGTH, side eats WIDTH — they are not interchangeable, and
     swapping them would offer a 10ft porch on a shed that cannot take one. */
  assert.equal(c.maxPorchFt('front'), 20 - c.MIN_ENCLOSED);
  assert.equal(c.maxPorchFt('side'), 12 - c.MIN_ENCLOSED);
});

test('10ft needs 16ft of run, and 15ft is not enough', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  const deepest = Math.max(...ladders().picker);
  assert.equal(deepest, 10);

  c.W = 12; c.L = 16;
  assert.ok(c.maxPorchFt('front') >= 10, 'a 16ft length should carry a 10ft front porch');
  c.L = 14;
  assert.ok(c.maxPorchFt('front') < 10, 'a 14ft length must not');
  c.W = 16;
  assert.ok(c.maxPorchFt('side') >= 10, 'a 16ft width should carry a 10ft side porch');
});

/* The point of raising the slider caps: the biggest shed has to be able to
   carry the deepest porch, or the two changes do not meet. */
test('the biggest shed the sliders allow can take the deepest porch', () => {
  const step = HTML.split('data-step="1"')[1].split('</div>\n      </div>')[0];
  const ranges = [...step.matchAll(/<input type="range" min="(\d+)" max="(\d+)"/g)]
    .map((m) => ({ min: +m[1], max: +m[2] }));
  const [wS, lS] = ranges;
  const deepest = Math.max(...ladders().picker);

  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.W = wS.max; c.L = lS.max;
  assert.ok(c.maxPorchFt('front') >= deepest,
    'max length ' + lS.max + ' leaves only ' + c.maxPorchFt('front') + 'ft of front porch');
  assert.ok(c.maxPorchFt('side') >= deepest,
    'max width ' + wS.max + ' leaves only ' + c.maxPorchFt('side') + 'ft of side porch');
});

// ── resizing under a porch ─────────────────────────────────────────────────

test('shrinking the shed pulls a deep porch in rather than deleting it', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.W = 12; c.L = 24;
  c.PORCH_LOC = 'front';
  c.SIDE_PORCH = 10;

  c.setL(16);                      // still room for 10ft (16 - 6)
  assert.equal(c.PORCH_LOC, 'front');
  assert.equal(c.SIDE_PORCH, 10, 'a porch that still fits must not be touched');

  c.setL(14);                      // now only 8ft fits
  assert.equal(c.PORCH_LOC, 'front', 'the porch is kept, not silently removed');
  assert.equal(c.SIDE_PORCH, 8, 'and pulled in to the deepest that fits');

  c.setL(12);                      // 6ft
  assert.equal(c.SIDE_PORCH, 6);
});

test('a footprint too small for any porch drops it, rather than leaving a stub', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.W = 12; c.L = 20;
  c.PORCH_LOC = 'front';
  c.SIDE_PORCH = 10;
  c.setL(8);                       // 8 - 6 = 2ft, shallower than the shallowest
  assert.equal(c.PORCH_LOC, 'none');
  assert.equal(c.SIDE_PORCH, 0);
});

test('a growing shed does not deepen a porch behind the customer’s back', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.W = 12; c.L = 12;
  c.PORCH_LOC = 'front';
  c.SIDE_PORCH = 4;
  c.setL(24);
  assert.equal(c.SIDE_PORCH, 4, 'they chose 4ft; more room is not more porch');
});
