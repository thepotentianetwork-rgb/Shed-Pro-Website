/* THE SLIDERS MUST NOT OFFER A SIZE THE SERVER WILL NOT PRICE.
 *
 * This already happened. The sliders were raised to 22x34 and the clamp in
 * worker/index.js stayed at 20x32. Nothing failed: the server shrank every
 * larger request and quoted the smaller shed, so a customer dragging to 22x34
 * saw the price of a 20x32 — on the page, in the quote, in the redline, all
 * agreeing with each other. Two numbers in two repositories, and no test on
 * either side could see the other.
 *
 * The fix is not a test. The server serves its limits with every quote and
 * this page sets the sliders from them, so the markup below is only a first
 * paint and the server corrects it. These tests hold that up from this side:
 *
 *   1. The markup's own bounds are sane and the presets fit inside them.
 *   2. Served limits are actually applied to the sliders.
 *   3. A value now out of bounds is pulled in AND the shed rebuilt, so the
 *      3D matches what will be priced rather than showing a shed nobody can buy.
 *   4. A value inside the bounds is left alone — the limits set the range,
 *      they do not reset the customer's build.
 *   5. Junk is ignored rather than blanking the sliders.
 *
 * Run: node --test tests/ui/shedlimits.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

function markupSliders() {
  const step = HTML.split('data-step="1"')[1].split('</div>\n      </div>')[0];
  return [...step.matchAll(/<input type="range" min="(\d+)" max="(\d+)"[^>]*step="(\d+)"/g)]
    .map((m) => ({ min: +m[1], max: +m[2], step: +m[3] }));
}

test('the markup bounds are sane, and width reaches 26', () => {
  const [w, l, h] = markupSliders();
  assert.equal(w.max, 26, `the width slider stops at ${w.max}ft`);
  assert.equal(l.max, 34);
  assert.ok(w.min >= 6 && l.min >= 6 && h.max >= 12);
  // Even step sizes, so a slider can actually land on its own maximum.
  for (const s of [w, l]) {
    assert.equal((s.max - s.min) % s.step, 0,
      `a ${s.step}ft step from ${s.min} never lands on ${s.max}`);
  }
});

/* A stand-in for the size step's three range inputs, since the harness's DOM
   has no real ones. querySelectorAll is what applyShedLimits reaches for. */
function fakeSliders(values) {
  const rows = values.map((v) => ({ min: 6, max: 20, step: 2, value: v }));
  c.document.querySelectorAll = (sel) => (/data-step="1"/.test(sel) ? rows : []);
  return rows;
}
function withStubs(fn) {
  const saved = { setW: c.setW, setL: c.setL, setH: c.setH,
                  querySelectorAll: c.document.querySelectorAll };
  const built = [];
  c.setW = (v) => { c.W = +v; built.push(['w', +v]); };
  c.setL = (v) => { c.L = +v; built.push(['l', +v]); };
  c.setH = (v) => { c.H = +v; built.push(['h', +v]); };
  try { return fn(built); } finally { Object.assign(c, saved); c.document.querySelectorAll = saved.querySelectorAll; }
}

test('served limits are applied to the sliders', () => {
  withStubs(() => {
    const rows = fakeSliders([12, 16, 9]);
    c.W = 12; c.L = 16; c.H = 9;
    c.applyShedLimits({ w: { min: 6, max: 26, step: 2 }, l: { min: 6, max: 34, step: 2 },
                        h: { min: 6, max: 12, step: 1 } });
    assert.equal(rows[0].max, 26, 'the width slider did not take the served maximum');
    assert.equal(rows[1].max, 34);
    assert.equal(rows[2].max, 12);
  });
});

test('a build now out of bounds is pulled in AND rebuilt', () => {
  withStubs((built) => {
    const rows = fakeSliders([26, 34, 9]);
    c.W = 26; c.L = 34; c.H = 9;
    // The server comes back saying it will only price 20x32 after all.
    c.applyShedLimits({ w: { min: 6, max: 20, step: 2 }, l: { min: 6, max: 32, step: 2 } });
    assert.equal(c.W, 20, 'a 26ft width was left standing above the served maximum');
    assert.equal(c.L, 32);
    /* Rebuilt, not just re-labelled. Without this the 3D keeps showing the
       26ft shed while the quote prices a 20ft one — which is the original bug
       over again, with the two sides swapped. */
    assert.deepEqual(built.map((b) => b[0]).sort(), ['l', 'w']);
  });
});

test('a build inside the bounds is left exactly as it is', () => {
  withStubs((built) => {
    fakeSliders([12, 16, 9]);
    c.W = 12; c.L = 16; c.H = 9;
    c.applyShedLimits({ w: { min: 6, max: 26, step: 2 }, l: { min: 6, max: 34, step: 2 },
                        h: { min: 6, max: 12, step: 1 } });
    assert.deepEqual([c.W, c.L, c.H], [12, 16, 9]);
    assert.equal(built.length, 0, 'the limits rebuilt a shed that was already in range');
  });
});

test('the quote response actually calls it', () => {
  /* Everything above calls applyShedLimits directly, which proves it works and
     says nothing about whether anything ever runs it. Deleting the one line
     that does left every other test in this file green — the sliders would
     have stayed on whatever the markup said forever, which is the bug this
     whole mechanism exists to prevent.
     Checked against the source because the call sits inside a fetch .then()
     that cannot be reached without standing up the whole request; a textual
     check is weaker than a behavioural one but it is not nothing, and it is
     the difference between catching this and not. */
  const handler = HTML.split('quoteCache.optionPrices = d.optionPrices')[1];
  assert.ok(handler, 'could not find where a quote response is handled');
  const near = handler.slice(0, 1200);
  assert.match(near, /applyShedLimits\(\s*d\.optionPrices\.limits\s*\)/,
    'a quote comes back with limits on it and nothing applies them to the sliders');
});

test('junk limits are ignored rather than blanking the sliders', () => {
  withStubs((built) => {
    const rows = fakeSliders([12, 16, 9]);
    c.W = 12; c.L = 16; c.H = 9;
    for (const junk of [null, undefined, 'nope', 42, {}, { w: null },
                        { w: { min: 30, max: 6 } }, { w: { min: 6 } }]) {
      c.applyShedLimits(junk);
    }
    assert.equal(rows[0].max, 20, 'a malformed limit changed the slider anyway');
    assert.deepEqual([c.W, c.L, c.H], [12, 16, 9]);
    assert.equal(built.length, 0);
  });
});

/* ── THE PORCH DEPTHS, THE SAME WAY ──────────────────────────────────────────
   The ladder lived in two places here — the porch picker and clampPorch — and
   a third and fourth on the server. When it went to 10ft here and stayed at
   [4,6,8] there, the total was right (porch is priced per square foot) and the
   10ft tile was blank, because nothing had computed a price for a depth the
   server did not know was offered. Both ladders read the served list now. */

test('both porch ladders read one list', () => {
  const saved = c.quoteCache;
  try {
    c.quoteCache = { optionPrices: { limits: { porchDepths: [4, 6, 8, 10, 12] } } };
    assert.deepEqual(c.porchDepthOptions(), [4, 6, 8, 10, 12]);
    /* clampPorch filters the SAME list by what the footprint carries. Given a
       shed long enough for all of them, the deepest it will settle on has to
       be the deepest offered — if it were still reading its own [4,6,8] it
       would quietly take a 10ft porch back down to 8. */
    Object.assign(c, { STYLE: 'gable', W: 26, L: 34, PORCH_LOC: 'front', SIDE_PORCH: 12 });
    c.clampPorch();
    assert.equal(c.SIDE_PORCH, 12, 'clampPorch is using a ladder of its own');
  } finally { c.quoteCache = saved; }
});

test('the served list wins over the built-in one', () => {
  const saved = c.quoteCache;
  try {
    // The server drops 10ft back off the menu; the page must stop offering it.
    c.quoteCache = { optionPrices: { limits: { porchDepths: [4, 6] } } };
    assert.deepEqual(c.porchDepthOptions(), [4, 6]);
    Object.assign(c, { STYLE: 'gable', W: 26, L: 34, PORCH_LOC: 'front', SIDE_PORCH: 10 });
    c.clampPorch();
    assert.equal(c.SIDE_PORCH, 6, 'a depth the server no longer prices is still selectable');
  } finally { c.quoteCache = saved; }
});

test('with no quote yet, the built-in ladder still reaches 10ft', () => {
  const saved = c.quoteCache;
  try {
    // First paint, before anything has come back. It must not be empty, and
    // it must not have quietly lost the depth this whole change was about.
    for (const junk of [{}, { optionPrices: {} }, { optionPrices: { limits: {} } },
                        { optionPrices: { limits: { porchDepths: [] } } },
                        { optionPrices: { limits: { porchDepths: 'nope' } } },
                        { optionPrices: { limits: { porchDepths: [null, 'x'] } } }]) {
      c.quoteCache = junk;
      const got = c.porchDepthOptions();
      assert.ok(got.length > 0, 'the porch picker has no depths at all');
      assert.ok(got.includes(10), `the fallback ladder lost 10ft: ${got}`);
    }
  } finally { c.quoteCache = saved; }
});
