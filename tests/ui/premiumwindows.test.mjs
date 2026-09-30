/* THE PREMIUM WINDOW TIER — the tab, the badge, and the two ways a new catalog
 * group silently disappears.
 *
 * Before Premium existed the window picker split the catalog on ONE boolean:
 * transom, or not transom. A group added to WINDOW_CATALOG without touching
 * that split does not error and does not vanish — it lands in with the plain
 * windows, a $4,000 unit sorted between the $130 and the $185 one. So the
 * split is now a group lookup, and these tests hold it:
 *
 *   1. Every catalog entry lands in exactly one tab, and the tabs the step
 *      offers cover every group in the catalog. A new group with no tab fails
 *      here rather than quietly joining the plain windows.
 *   2. The premium tiles are the premium entries and nothing else — and the
 *      plain Window tab does NOT show them.
 *   3. The tier is marked. The Luxury stamp is the gold one the hip and peak
 *      shells carry, not the house orange "Popular" wears.
 *   4. A bi-fold opens on the Premium tab when it is tapped in the 3D view,
 *      which is the only route to its fold controls.
 *   5. Those controls are all three the brief asked for, they read the placed
 *      window's own state, and each writes only its own field.
 *   6. A bi-fold is mounted at BAR height. It is wider than it is tall, and
 *      the rule for a wide short window puts it up under the eave — a serving
 *      hatch at seven feet, which is the sort of thing that ships.
 *
 * Shutters and flower boxes are barred from a premium window too; that one is
 * asked of the geometry, in tests/geometry/bifold.test.mjs.
 *
 * Run: node --test tests/ui/premiumwindows.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const BIFOLD = 'Black Bi-Fold Bar 72x40';
const LIFTUP = 'Black Lift-Up Bar 60x42';

test('every catalog group has a tab, and every entry lands in exactly one', () => {
  const tabs = c.WINDOW_CATS.map((t) => t.cat).filter((t) => t !== 'vent');
  for (const e of c.WINDOW_CATALOG) {
    const cat = c.winCatOf(e);
    assert.ok(tabs.includes(cat),
      `"${e.key}" (group "${e.grp}") resolves to tab "${cat}", which the window step does not offer`);
  }
  // And the reverse: a tab with nothing under it is a dead tile.
  for (const t of tabs) {
    assert.ok(c.WINDOW_CATALOG.some((e) => c.winCatOf(e) === t), `the "${t}" tab shows nothing`);
  }
  assert.ok(tabs.includes('premium'), 'there is no Premium tab');
});

test('the premium tab shows the premium windows, and the plain tab does not', () => {
  const premium = c.WINDOW_CATALOG.filter((e) => e.grp === 'Premium');
  assert.ok(premium.length >= 1, 'no Premium entries in the catalog');
  for (const e of premium) assert.equal(c.winCatOf(e), 'premium', `${e.key} is not on the premium tab`);
  for (const e of c.WINDOW_CATALOG) {
    if (e.grp === 'Premium') continue;
    assert.notEqual(c.winCatOf(e), 'premium', `${e.key} leaked onto the premium tab`);
  }
  // The bi-fold sizes the brief asked for, each a width that divides by three.
  const bifolds = premium.filter((e) => /Bi-Fold Bar/.test(e.key));
  assert.ok(bifolds.length >= 3, `expected at least 3 bi-fold sizes, got ${bifolds.length}`);
  for (const e of bifolds) {
    assert.equal(e.w % 3, 0, `${e.key} is ${e.w}" wide, which does not divide into three equal panels`);
  }
});

test('the Premium tile carries the gold Luxury stamp, not the orange one', () => {
  const tile = c.WINDOW_CATS.find((t) => t.cat === 'premium');
  assert.ok(tile.badge, 'the Premium tile has no badge');
  assert.equal(tile.badge.tier, 'luxury',
    'Premium is badged in the house orange — the tier only reads as a tier in gold');
  // The same tier the premium SHELLS use, so the two marks match across steps.
  const shell = c.STYLE_BADGES['3peak'];
  assert.equal(tile.badge.tier, shell.tier);
  assert.equal(tile.badge.text, shell.text);
});

test('a placed bi-fold is recognised, and a premium window is not mistaken for one', () => {
  assert.ok(c.isBifold({ type: BIFOLD }));
  assert.ok(c.isPremiumWin({ type: BIFOLD }));
  // The gas-strut bar window is a single panel hinging upward. It will be
  // premium and it must NOT answer to the fold code, so the two questions are
  // deliberately separate and only one of them is about the tier.
  assert.ok(!c.isBifold({ type: 'Black Gas-Strut Bar 72x40' }));
  for (const e of c.WINDOW_CATALOG) {
    if (e.grp === 'Premium') continue;
    assert.ok(!c.isBifold({ type: e.key }), `${e.key} answers to the bi-fold builder`);
    assert.ok(!c.isPremiumWin({ type: e.key }), `${e.key} counts as premium`);
  }
  assert.ok(!c.isBifold({}));
  assert.ok(!c.isPremiumWin({}));
});

test('the fold controls are all three, and read the window they are on', () => {
  c.windowsData = [{ wall:'front', pos:0.5, w:72, h:40, cy:62, type:BIFOLD,
                     open:false, fold:'left', ledge:true }];
  c.selectedKind = 'window'; c.selectedWindow = 0;
  const shut = c.bifoldControlsHTML(0);
  for (const label of ['Panels', 'Fold toward', 'Exterior bar ledge']) {
    assert.ok(shut.includes(label), `the controls are missing "${label}"`);
  }
  for (const fn of ['setBifoldOpen(0,', 'setBifoldFold(0,', 'setBifoldLedge(0,']) {
    assert.ok(shut.includes(fn), `nothing calls ${fn}`);
  }

  /* Which button reads as ON. Checked by finding the option's own label in the
     markup and looking at the highlight on THAT chip — a substring test for
     the highlight colour alone passes as long as any one chip is lit. */
  const lit = (html, text) => {
    const at = html.indexOf('>' + text + '</div>');
    assert.ok(at > 0, `no "${text}" button`);
    return html.slice(html.lastIndexOf('<div onclick', at), at).includes('#2BB5E8');
  };
  assert.ok(lit(shut, 'Closed') && !lit(shut, 'Open'), 'a shut window should show Closed selected');
  assert.ok(lit(shut, 'Left') && !lit(shut, 'Right'), 'it folds left by default');
  assert.ok(lit(shut, 'On') && !lit(shut, 'Off'), 'the bar ledge is on by default');

  /* Each setter writes its own field and leaves the others alone. The page's
     globals are one shared object across this whole file, so anything stubbed
     here has to be put back — a permanent stub of
     openOptionsForSelectedWindow made the tap test below open nothing, and it
     read as a routing bug rather than as this. */
  const saved = { buildShed: c.buildShed, renderPlacedWindows: c.renderPlacedWindows,
                  syncEditorPanel: c.syncEditorPanel,
                  openOptionsForSelectedWindow: c.openOptionsForSelectedWindow };
  c.buildShed = () => {}; c.renderPlacedWindows = () => {}; c.syncEditorPanel = () => {};
  c.openOptionsForSelectedWindow = () => {};
  try {
  c.setBifoldOpen(0, true);
  assert.deepEqual([c.windowsData[0].open, c.windowsData[0].fold, c.windowsData[0].ledge],
                   [true, 'left', true]);
  c.setBifoldFold(0, 'right');
  assert.deepEqual([c.windowsData[0].open, c.windowsData[0].fold, c.windowsData[0].ledge],
                   [true, 'right', true]);
  c.setBifoldLedge(0, false);
  assert.deepEqual([c.windowsData[0].open, c.windowsData[0].fold, c.windowsData[0].ledge],
                   [true, 'right', false]);
  // A junk fold value falls back rather than rendering a window with no panels.
  c.setBifoldFold(0, 'sideways');
  assert.equal(c.windowsData[0].fold, 'left');
  // And the setters refuse a window that is not a bi-fold.
  c.windowsData.push({ wall:'back', pos:0.5, w:36, h:36, cy:52, type:'Black Vinyl 36x36' });
  c.setBifoldOpen(1, true);
  assert.equal(c.windowsData[1].open, undefined, 'a vinyl window should not take a fold state');
  } finally { Object.assign(c, saved); }
});

/* Opens the real window panel and hands back the markup it would show. The
   page builds its sub-pages as an HTML string and passes them to openSubPage,
   so intercepting that is how a test sees what a customer would. */
function capture(open) {
  let seen = null;
  const real = c.openSubPage;
  c.openSubPage = (title, html) => { seen = { title, html }; };
  try { open(); } finally { c.openSubPage = real; }
  assert.ok(seen, 'nothing was opened');
  return seen;
}
const panelFor = (cat) => capture(() => { c.openWinCat = null; c.openWindowOptions(cat); });
// What a TAP on the window in the 3D view actually runs. Going straight to
// openWindowOptions('premium') asks whether the panel can hold the controls;
// this asks whether a customer ever lands on it.
const panelFromTap = () => capture(() => c.openOptionsForSelectedWindow());

test('the premium panel lists the premium windows and nothing else', () => {
  c.windowsData = []; c.selectedKind = ''; c.selectedWindow = -1;
  c.quoteCache = c.quoteCache || {};
  const { title, html } = panelFor('premium');
  assert.match(title, /Premium/, `the panel is titled "${title}"`);
  for (const e of c.WINDOW_CATALOG) {
    const shown = html.includes("addWindowByKey('" + e.key.replace(/'/g, "\\'") + "')");
    assert.equal(shown, e.grp === 'Premium',
      `"${e.key}" is ${shown ? '' : 'not '}on the Premium panel`);
  }
  // And the plain Window panel must not be showing them either — that is the
  // exact shape of the bug this tab exists to avoid.
  const plain = panelFor('window').html;
  for (const e of c.WINDOW_CATALOG.filter((x) => x.grp === 'Premium')) {
    assert.ok(!plain.includes("addWindowByKey('" + e.key + "')"),
      `"${e.key}" is in with the plain windows`);
  }
});

test('tapping a placed bi-fold reaches its fold controls', () => {
  /* The controls existing is not the same as a customer being able to get to
     them. This is the ONLY surface a tap on the window in the 3D view opens —
     the editor panel is behind it — so if openWindowOptions does not put them
     in, the fold direction is unreachable and nothing else would say so. */
  c.ADD_WALL = 'front';
  c.windowsData = [{ wall:'front', pos:0.5, w:72, h:40, cy:62, type:BIFOLD,
                     open:false, fold:'left', ledge:true }];
  c.selectedKind = 'window'; c.selectedWindow = 0;
  const { title, html } = panelFromTap();
  assert.match(title, /Premium/, `a tapped bi-fold opened "${title}" instead of the Premium panel`);
  for (const label of ['Panels', 'Fold toward', 'Exterior bar ledge']) {
    assert.ok(html.includes(label), `the panel a tap opens has no "${label}" control`);
  }
  assert.ok(html.includes('setBifoldFold(0,'), 'the fold control is not wired on the open panel');

  // An ordinary window tapped on the same wall gets its own panel and no fold
  // controls — so the routing above is a choice, not everything going premium.
  c.windowsData = [{ wall:'front', pos:0.5, w:36, h:36, cy:52, type:'Black Vinyl 36x36' }];
  const plain = panelFromTap();
  assert.ok(!/Premium/.test(plain.title), `a vinyl window opened "${plain.title}"`);
  assert.ok(!plain.html.includes('setBifoldFold'), 'a vinyl window is being offered fold controls');
});

test('a bi-fold hangs at bar height, not up under the eave', () => {
  c.H = 9;
  const e = c.WINDOW_CATALOG.find((x) => x.key === BIFOLD);
  const cy = c.defaultCyFor(e.h, e.key, e.w);
  const sill = cy - e.h / 2;
  assert.equal(sill, c.BAR_SILL_IN(), `sill lands at ${sill}" instead of bar height`);

  /* The rule this has to beat. A 72x40 is "clearly wider than tall", and that
     rule mounts a window just under the wall top — a 4'10" sill on a 9ft wall,
     more than a foot above the counter it is supposed to serve over. Asserted
     rather than assumed, because without it this test passes on a build where
     the ordering is wrong and the fallback happens to be close enough. */
  const bandSill = c.defaultCyFor(e.h, 'Black Vinyl 72x40', e.w) - e.h / 2;
  assert.ok(bandSill > c.BAR_SILL_IN() + 12,
    `the wide-window rule should mount well above bar height (${bandSill}")`);
  assert.ok(sill < bandSill, 'the bi-fold is being mounted by the wide-window rule');
});

/* ── THE TWO PREMIUM PRODUCTS ARE NOT VARIANTS OF EACH OTHER ──────────────
   One folds sideways on three vertical hinges; one lifts overhead on a top
   hinge and two gas struts. They share a tier, a sill height and a counter,
   and nothing else. The brief says to keep them completely separate, so these
   tests are about the ways they could quietly merge. */

test('the two bar windows are told apart, and neither answers for the other', () => {
  assert.ok(c.isBifold({ type: BIFOLD }) && !c.isLiftUp({ type: BIFOLD }));
  assert.ok(c.isLiftUp({ type: LIFTUP }) && !c.isBifold({ type: LIFTUP }));
  // Both are bar windows, which is what the shared parts key off.
  assert.ok(c.isBarWindow({ type: BIFOLD }) && c.isBarWindow({ type: LIFTUP }));
  assert.ok(c.isPremiumWin({ type: LIFTUP }));
  // And nothing else in the catalog is either.
  for (const e of c.WINDOW_CATALOG) {
    if (e.grp === 'Premium') continue;
    assert.ok(!c.isBarWindow({ type: e.key }), `${e.key} counts as a bar window`);
  }
  assert.ok(!c.isBarWindow({}));
});

test('every lift-up size the brief asked for is in the catalog', () => {
  const want = [[48, 36], [60, 42], [72, 42], [96, 48]];
  const got = c.WINDOW_CATALOG.filter((e) => /Lift-Up Bar/.test(e.key)).map((e) => [e.w, e.h]);
  assert.equal(got.map((g) => g.join('x')).join(','), want.map((g) => g.join('x')).join(','));
  // Its sill lands at bar height too — the rule belongs to bar windows, not
  // to the bi-fold that happened to need it first.
  c.H = 9;
  const e = c.WINDOW_CATALOG.find((x) => x.key === LIFTUP);
  assert.equal(c.defaultCyFor(e.h, e.key, e.w) - e.h / 2, c.BAR_SILL_IN());
});

test('the two products get different tiles, and the lift-up tile shows it open', () => {
  assert.notEqual(c.premiumIcon(BIFOLD), c.premiumIcon(LIFTUP),
    'both premium windows draw the same tile — a customer choosing between them sees one shape');
  /* The brief asks for the lift-up preview in the OPEN position with the
     ledge: shut it is one big rectangle, which says nothing about what the
     upgrade does. The icon is checked for the two marks only the open form
     has — a sash lifted clear above the opening, and the counter under it. */
  const svg = c.itemIcon(c.premiumIcon(LIFTUP));
  assert.ok(/stroke-dasharray/.test(svg), 'the lift-up tile does not show the opening standing clear');
  assert.ok(/stroke-width="2.6"/.test(svg), 'the lift-up tile has no bar ledge on it');
});

test('a lift-up is placed OPEN, matching its own tile', () => {
  c.ADD_WALL = 'front'; c.W = 12; c.L = 20; c.H = 9;
  c.windowsData = []; c.selectedKind = ''; c.selectedWindow = -1;
  const saved = { buildShed: c.buildShed, renderPlacedWindows: c.renderPlacedWindows,
                  closeSubPage: c.closeSubPage };
  c.buildShed = () => {}; c.renderPlacedWindows = () => {}; c.closeSubPage = () => {};
  let toast = '';
  const savedToast = c.showToast; c.showToast = (m) => { toast = m; };
  try {
    // One per wall. A 5ft and a 6ft bar window will not both fit on a 12ft
    // front wall with their casings, and the placer says so rather than
    // stacking them — which left the second one unplaced and this test
    // reading a field off undefined.
    c.ADD_WALL = 'front'; c.addWindowByKey(LIFTUP);
    c.ADD_WALL = 'back';  c.addWindowByKey(BIFOLD);
  } finally { Object.assign(c, saved); c.showToast = savedToast; }
  assert.equal(c.windowsData.length, 2, `only ${c.windowsData.length} placed: ${toast}`);
  const lift = c.windowsData.find((w) => w.type === LIFTUP);
  const fold = c.windowsData.find((w) => w.type === BIFOLD);
  assert.ok(lift, 'the lift-up was not placed');
  assert.equal(lift.open, true, 'a lift-up should arrive open, as its tile draws it');
  assert.equal(lift.ledge, true);
  assert.equal(lift.fold, undefined, 'a lift-up has no fold direction');
  // The bi-fold still arrives closed — its own tile shows it part-folded.
  assert.equal(fold.open, false);
  assert.equal(fold.fold, 'left');
});

test('the lift-up controls drop Fold and keep the rest', () => {
  c.windowsData = [{ wall:'front', pos:0.5, w:60, h:42, cy:63, type:LIFTUP, open:true, ledge:true }];
  c.selectedKind = 'window'; c.selectedWindow = 0;
  const html = c.barWindowControlsHTML(0);
  assert.ok(html.includes('Sash'), 'the lift-up has no open/close control');
  assert.ok(html.includes('Exterior bar ledge'), 'the lift-up has no ledge control');
  assert.ok(html.includes('matte black'), 'the frame finish is not stated');
  assert.ok(!html.includes('Fold toward'),
    'a lift-up is being offered a fold direction — it has no side to fold to');
  // The bi-fold still has it, so the absence above is a choice.
  c.windowsData = [{ wall:'front', pos:0.5, w:72, h:40, cy:62, type:BIFOLD, ledge:true }];
  assert.ok(c.barWindowControlsHTML(0).includes('Fold toward'));

  // And the fold setter refuses to write one onto a lift-up.
  c.windowsData = [{ wall:'front', pos:0.5, w:60, h:42, cy:63, type:LIFTUP, open:true }];
  const saved = { buildShed: c.buildShed, renderPlacedWindows: c.renderPlacedWindows,
                  syncEditorPanel: c.syncEditorPanel,
                  openOptionsForSelectedWindow: c.openOptionsForSelectedWindow };
  c.buildShed = () => {}; c.renderPlacedWindows = () => {}; c.syncEditorPanel = () => {};
  c.openOptionsForSelectedWindow = () => {};
  try { c.setBifoldFold(0, 'right'); } finally { Object.assign(c, saved); }
  assert.equal(c.windowsData[0].fold, undefined,
    'a fold direction was written onto a lift-up, into a field nothing reads');
});

test('the ledge control says what the ledge costs', () => {
  /* It is a priced option now, so a customer switching it on should see the
     number on the control rather than find it later on the quote. The figure
     is a dollar amount the server computed per placed window — the page never
     holds the $/ft rate. */
  c.windowsData = [{ wall:'front', pos:0.5, w:60, h:42, cy:63, type:LIFTUP, open:true, ledge:true }];
  c.selectedKind = 'window'; c.selectedWindow = 0;
  const savedCache = c.quoteCache;
  c.quoteCache = { optionPrices: { barLedge: [475] } };
  c.PRICE_LOCKED = false;
  try {
    assert.ok(/\$475/.test(c.barWindowControlsHTML(0)), 'the ledge price is not on its control');
    // With no price served the control still renders, rather than blanking.
    c.quoteCache = { optionPrices: {} };
    assert.ok(c.barWindowControlsHTML(0).includes('Exterior bar ledge'));
  } finally { c.quoteCache = savedCache; }
});
