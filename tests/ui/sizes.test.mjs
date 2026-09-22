/* PRESET SIZES HAVE TO BE SIZES THE SLIDERS CAN HOLD.
 *
 * Both sliders step in 2ft over a fixed range. A preset outside that range, or
 * odd on either count, would be clamped or rounded by setW/setL — the tile
 * would say 9x13 and the customer would get 10x14. That is the one failure
 * worth a test, because it is invisible: the shed just quietly is not the one
 * on the tile.
 *
 * The slider bounds are read out of the page's own markup rather than copied
 * here, so widening a slider does not leave this passing against the old
 * numbers.
 *
 * Run: node --test tests/ui/sizes.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

// The three range inputs on the size step, in markup order: width, length, height.
function sliders() {
  const step = HTML.split('data-step="1"')[1].split('</div>\n      </div>')[0];
  return [...step.matchAll(/<input type="range" min="(\d+)" max="(\d+)"[^>]*step="(\d+)"/g)]
    .map(m => ({ min: +m[1], max: +m[2], step: +m[3] }));
}

test('the page still has the two sliders these presets have to satisfy', () => {
  const s = sliders();
  assert.ok(s.length >= 2, `found ${s.length} range inputs on the size step`);
});

test('every preset is a size the sliders can actually hold', () => {
  const [wS, lS] = sliders();
  const bad = [];
  for (const sz of c.POPULAR_SIZES) {
    if (sz.w < wS.min || sz.w > wS.max) bad.push(`${sz.w}x${sz.l}: width outside ${wS.min}-${wS.max}`);
    if (sz.l < lS.min || sz.l > lS.max) bad.push(`${sz.w}x${sz.l}: length outside ${lS.min}-${lS.max}`);
    if ((sz.w - wS.min) % wS.step) bad.push(`${sz.w}x${sz.l}: width is off the ${wS.step}ft step`);
    if ((sz.l - lS.min) % lS.step) bad.push(`${sz.w}x${sz.l}: length is off the ${lS.step}ft step`);
  }
  assert.deepEqual(bad, [], bad.join('; '));
});

test('no preset is listed twice', () => {
  const seen = c.POPULAR_SIZES.map(s => s.w + 'x' + s.l);
  assert.equal(new Set(seen).size, seen.length, seen.join(', '));
});

test('they run smallest to largest, so the strip reads as a ladder', () => {
  const area = c.POPULAR_SIZES.map(s => s.w * s.l);
  const sorted = area.slice().sort((a, b) => a - b);
  assert.deepEqual(area, sorted, `${area.join(', ')}`);
});

test('the permit line is marked, and marked correctly', () => {
  // The box under the sliders already warns at 200 sqft. A tile that disagreed
  // with it would be worse than a tile that said nothing.
  assert.equal(c.PERMIT_SQFT, 200);
  const under = c.POPULAR_SIZES.filter(s => s.w * s.l <= c.PERMIT_SQFT);
  const over = c.POPULAR_SIZES.filter(s => s.w * s.l > c.PERMIT_SQFT);
  assert.ok(under.length, 'some presets stay under the line');
  assert.ok(over.length, 'and some do not — the mark means something');
});

test('picking one sets the size, and counts as the customer choosing it', () => {
  /* SIZE_SET_BY_CUSTOMER is what stops a later style change resizing the
     build. Assigning W and L directly would skip it, and picking 12x20 then
     switching to a lean-to would silently snap back to 12x6. */
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.SIZE_SET_BY_CUSTOMER = false;
  c.applyPopularSize(12, 20);
  assert.equal(c.W, 12);
  assert.equal(c.L, 20);
  assert.equal(c.SIZE_SET_BY_CUSTOMER, true, 'the size is now the customer\'s');
});

test('the highlight follows the size, including off the presets', () => {
  c.buildShed = function () {};
  c.autoFrame = function () {};
  c.applyPopularSize(10, 16);
  const onPreset = c.currentSizeKey();
  assert.ok(onPreset >= 0, 'a preset size highlights its tile');
  assert.equal(c.POPULAR_SIZES[onPreset].w, 10);
  assert.equal(c.POPULAR_SIZES[onPreset].l, 16);

  c.setL(18);                       // dragged off it
  assert.equal(c.currentSizeKey(), -1, 'nothing highlights a size that is not a preset');
});
