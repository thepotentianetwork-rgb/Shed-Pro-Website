/* THE UPGRADES STEP IS A LIST OF SECTIONS, NOT FOURTEEN CHECKBOXES.
 *
 * In one flat column a customer had to read every line to find the two they
 * came for, and "Remove Existing Concrete" sat next to "Flower Boxes" as
 * though they were the same kind of decision.
 *
 * The renderer walks the SECTIONS and pulls each one's items, rather than
 * walking the items and printing a heading whenever the section changes. Both
 * produce the same list while the array happens to be sorted; only one of them
 * still works the day an item is added in the wrong place. That is what most
 * of this file is checking.
 *
 * Run: node --test tests/ui/addons.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const sink = { innerHTML: '' };
c.document.getElementById = (id) => (id === 'addonList' ? sink : null);
c.ADDONS = {};
c.PRICE_LOCKED = false;
c.quoteCache = { optionPrices: { addons: {} } };
const ORIGINAL = c.ADDON_ITEMS.slice();

function render(style) {
  c.STYLE = style || 'gable';
  c.ADDON_ITEMS = ORIGINAL.slice();
  sink.innerHTML = '';
  c.renderAddons();
  return sink.innerHTML;
}
// The rendered list as [{head, items:[key,…]}, …], in document order.
function groups(html) {
  const out = []; let cur = null;
  const re = /(class="addon-sec">([^<]+)<)|(toggleAddon\('([^']+)'\))/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[2]) { cur = { head: m[2], items: [] }; out.push(cur); }
    else if (cur) cur.items.push(m[4]);
    else out.push({ head: null, items: [m[4]] });
  }
  return out;
}

test('every upgrade sits under a heading', () => {
  const g = groups(render());
  assert.ok(g.length, 'something rendered');
  assert.equal(g.filter(x => x.head === null).length, 0,
    'no item appears before the first heading');
  const shown = g.flatMap(x => x.items);
  assert.equal(shown.length, ORIGINAL.length, 'every item is listed once');
  assert.equal(new Set(shown).size, shown.length, 'and only once');
});

test('the sections are the ones the list declares, in that order', () => {
  const g = groups(render());
  assert.deepEqual(g.map(x => x.head), Array.from(c.ADDON_SECTIONS).map(s => s.name));
});

test('each item lands in the section it claims', () => {
  const g = groups(render());
  const where = {};
  for (const grp of g) for (const k of grp.items) where[k] = grp.head;
  for (const it of ORIGINAL) {
    const want = Array.from(c.ADDON_SECTIONS).find(s => s.k === it.sec);
    assert.equal(where[it.k], want.name, `${it.k} is under ${want.name}`);
  }
});

test('no heading is printed twice', () => {
  // The failure a heading-on-change renderer produces when the array is not
  // sorted: "Access" appearing above and below something else.
  const heads = groups(render()).map(x => x.head);
  assert.equal(new Set(heads).size, heads.length, heads.join(' / '));
});

test('an item added in the wrong place still lands in its own section', () => {
  c.STYLE = 'gable';
  c.ADDON_ITEMS = ORIGINAL.slice();
  c.ADDON_ITEMS.splice(1, 0, { k:'lateStairs', name:'Late Stairs', sec:'access' });
  sink.innerHTML = '';
  c.renderAddons();
  const g = groups(sink.innerHTML);
  const access = g.find(x => x.head === 'Access');
  assert.ok(access.items.includes('lateStairs'), 'it is under Access');
  assert.equal(new Set(g.map(x => x.head)).size, g.length, 'and no heading repeated');
  c.ADDON_ITEMS = ORIGINAL.slice();
});

test('an item with no section is shown rather than swallowed', () => {
  // An unlabelled item is a mistake, but hiding it from the customer — and
  // from the price — is a worse one.
  c.STYLE = 'gable';
  c.ADDON_ITEMS = ORIGINAL.concat([{ k:'mystery', name:'Unsectioned Thing' }]);
  sink.innerHTML = '';
  c.renderAddons();
  const g = groups(sink.innerHTML);
  assert.ok(g.some(x => x.items.includes('mystery')), 'it renders');
  assert.equal(g.find(x => x.items.includes('mystery')).head, 'More');
  c.ADDON_ITEMS = ORIGINAL.slice();
});

test('a lean-to loses the ridge vent but keeps its section', () => {
  const g = groups(render('leanto'));
  const env = g.find(x => x.head === 'Insulation & Weatherproofing');
  assert.ok(env, 'the section is still there — its other items apply');
  assert.ok(!env.items.includes('ridgeVent'), 'no vent on a roof with no ridge');
  assert.ok(env.items.includes('houseWrap'), 'the rest of it is intact');
});

test('a section with nothing left to show prints no heading', () => {
  // Otherwise a lean-to gets an empty "Access" bar with a rule under it.
  c.STYLE = 'leanto';
  c.ADDON_ITEMS = ORIGINAL.filter(it => it.sec !== 'access')
    .concat([{ k:'onlyRidgeThing', name:'Ridge Only', needsRidge:true, sec:'access' }]);
  sink.innerHTML = '';
  c.renderAddons();
  const heads = groups(sink.innerHTML).map(x => x.head);
  assert.ok(!heads.includes('Access'), `empty section is not printed (${heads.join(' / ')})`);
  c.ADDON_ITEMS = ORIGINAL.slice();
});

test('the "shown in 3D" tag is gone from the upgrades', () => {
  for (const style of ['gable', 'leanto', 'barn']) {
    assert.ok(!/shown in 3D/.test(render(style)), `${style}: no 3D tag`);
  }
});
