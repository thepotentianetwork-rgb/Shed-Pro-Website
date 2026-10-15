/* SPRINKLER RELOCATION AND THE CONCRETE PAD PROMO, on the designer side.
 *
 * Sprinklers: a head count, every head "up to 5 ft" unless the customer opens
 * the per-head pickers. The prices come from the worker
 * (optionPrices.sprinkler.byFt) — this page holds no rate — and the row is not
 * offered at all until the worker prices it, so an older worker can never be
 * asked to quote heads it would drop.
 *
 * Pad promo: optionPrices.foundation.pad is what the customer pays; padList
 * and padPromo, when sent, put the list price struck through beside it.
 *
 * Run: node --test tests/ui/sprinkler-promo.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const sinks = { addonList: { innerHTML: '' }, foundationList: { innerHTML: '', querySelector: () => null } };
c.document.getElementById = (id) => sinks[id] || null;
c.buildShed = () => {};
c.PRICE_LOCKED = false;
const SPR = { base: 300, includedFt: 5, stepFt: 2, stepAmt: 100,
              byFt: { 5: 300, 7: 400, 9: 500, 11: 600, 13: 700, 15: 800, 17: 900, 19: 1000, 21: 1100, 23: 1200, 25: 1300 } };
function prices(op) { c.quoteCache = { optionPrices: Object.assign({ addons: {} }, op) }; }
function addons() { sinks.addonList.innerHTML = ''; c.renderAddons(); return sinks.addonList.innerHTML; }

test('not offered until the worker prices it', () => {
  prices({});
  c.SPRINKLERS.length = 0;
  assert.ok(!/Relocate Sprinkler Heads/.test(addons()));
  prices({ sprinkler: SPR });
  const h = addons();
  assert.match(h, /Relocate Sprinkler Heads/);
  assert.match(h, /\$300 per head up to 5 ft · \+\$100 each extra 2 ft/);
});

test('switching it on starts at one head, up to 5 ft, $300', () => {
  prices({ sprinkler: SPR });
  c.SPRINKLERS.length = 0;
  c.toggleSprinklers();
  assert.deepEqual(Array.from(c.SPRINKLERS), [5]);
  const h = addons();
  assert.match(h, /id="sprinklerCount"[^>]*>1</);
  assert.match(h, /Each head moved up to 5 ft/);
  assert.match(h, /id="sprinklerTotal">\$300</);
});

test('three heads: $900; one moved 8 ft: $1,000, and the pickers stay open', () => {
  prices({ sprinkler: SPR });
  c.setSprinklerCount(3);
  assert.equal(c.sprinklerTotal(), 900);
  assert.match(addons(), /Sprinkler relocation — 3 heads \(estimate\)<\/span><span id="sprinklerTotal">\$900</);
  c.setSprinklerFt(2, 9);
  assert.equal(c.sprinklerTotal(), 300 + 300 + 500);
  const h = addons();
  assert.equal((h.match(/class="spr-ft"/g) || []).length, 3, 'one picker per head');
  assert.match(h, /<option value="9" selected>8–9 ft — \$500<\/option>/);
  assert.match(h, /<option value="5" selected>Up to 5 ft — \$300<\/option>/);
});

test('the per-head price follows the 2 ft steps, partial steps rounding up', () => {
  prices({ sprinkler: SPR });
  const want = { 3: 300, 5: 300, 6: 400, 7: 400, 8: 500, 9: 500, 10: 600, 25: 1300 };
  for (const [ft, p] of Object.entries(want)) assert.equal(c.sprinklerHeadPrice(Number(ft)), p, ft + ' ft');
});

test('count is capped at 20 and 0 switches it off', () => {
  prices({ sprinkler: SPR });
  c.setSprinklerCount(50);
  assert.equal(c.SPRINKLERS.length, 20);
  c.setSprinklerCount(0);
  assert.equal(c.SPRINKLERS.length, 0);
  assert.ok(!/sprinklerCount/.test(addons()), 'panel closed');
});

test('saved in the design only when there are heads, restored, and cleared by a design without', () => {
  prices({ sprinkler: SPR });
  c.SPRINKLERS.length = 0;
  assert.equal('sprinklers' in c.getDesignConfig(), false, 'a design without heads keeps its old shape');
  c.setSprinklerCount(2); c.setSprinklerFt(1, 7);
  const cfg = c.getDesignConfig();
  assert.deepEqual(Array.from(cfg.sprinklers), [5, 7]);
  c.applyDesignConfig({ style: 'gable', w: 10, l: 12 });
  assert.equal(c.SPRINKLERS.length, 0, 'an older design brings no heads with it');
  c.applyDesignConfig(JSON.parse(JSON.stringify(cfg)));
  assert.deepEqual(Array.from(c.SPRINKLERS), [5, 7]);
  c.SPRINKLERS.length = 0;
});

test('the pad tile: list struck through, the promo named, what they pay', () => {
  c.FOUNDATION = 'pad';
  prices({ foundation: { pad: 3000, padList: 3500, padPromo: 500, blocks: 0, existing: 0, gravel: 1100 },
           foundationFinish: { plain: 0, broom: 1000, coated: 300 } });
  sinks.foundationList.innerHTML = '';
  c.renderFoundation();
  const h = sinks.foundationList.innerHTML;
  assert.match(h, /class="pad-was"[^>]*>\$3,500<\/span>\+\$3,000/);
  assert.match(h, /class="pad-promo"[^>]*>\$500 promo</);
});

test('an older worker (pad only) shows the tile exactly as before', () => {
  c.FOUNDATION = 'pad';
  prices({ foundation: { pad: 3000, blocks: 0, existing: 0, gravel: 1100 }, foundationFinish: { plain: 0 } });
  c.renderFoundation();
  const h = sinks.foundationList.innerHTML;
  assert.ok(!/pad-was|pad-promo/.test(h));
  assert.match(h, /\+\$3,000/);
});

test('locked pricing shows no numbers on the tile or the sprinkler row', () => {
  c.PRICE_LOCKED = true;
  prices({ foundation: { pad: 3000, padList: 3500, padPromo: 500 }, sprinkler: SPR });
  c.renderFoundation();
  const h = sinks.foundationList.innerHTML;
  assert.ok(!/\$3,500|\$3,000|pad-was/.test(h), 'no list or pay figure');
  assert.match(h, /class="pad-promo"[^>]*>\$500 promo applied</, 'but the promo is still named');
  c.setSprinklerCount(1);
  assert.ok(!/\$300/.test(addons()));
  c.setSprinklerCount(0);
  c.PRICE_LOCKED = false;
});

test('concrete pad and sprinkler relocation are labelled as estimates', () => {
  const src = readFileSync(new URL('../../designer.html', import.meta.url), 'utf8');
  assert.match(src, /SITE_ESTIMATE_NOTE='Estimate\. Final price may vary based on site conditions\.'/);
  assert.match(src, /same size as your shed\. '\+SITE_ESTIMATE_NOTE/);
  assert.match(src, /class="spr-est"[^>]*>'\+SITE_ESTIMATE_NOTE/);
});
