/* THE SHELF LIST IS THE REAL FIX.
 *
 * A customer ended up with four shelves, two of them inside the others, and
 * was quoted $330 over. The spacing bug is what let them pile up; what let it
 * go UNNOTICED is that nothing on the page ever said how many shelves there
 * were. Windows and doors have had a placed list since they were built.
 * Shelves never did.
 *
 * Shelving is priced by the foot, so the count is money. These check the
 * customer can read it rather than having to count boards in a 3D view.
 *
 * Run: node --test tests/ui/shelflist.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

function fresh() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  const host = { innerHTML: '' };
  c.document.getElementById = (id) => (id === 'placedShelves' ? host : null);
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'', selectedShelf:-1,
    windowsData:[], ventsData:[], shelvesData:[], doorsData:[], porchLightsData:[], ADDONS:{},
    showToast(){}, toggleEditMode(){}, refreshInterior(){} });
  c.__stubLights();
  return { c, host };
}

test('an empty shed says so, rather than showing nothing at all', () => {
  const { c, host } = fresh();
  c.renderPlacedShelves();
  assert.match(host.innerHTML, /No shelves yet/i);
});

test('the count is stated in words, because the count is money', () => {
  const { c, host } = fresh();
  c.addShelf();
  c.renderPlacedShelves();
  assert.match(host.innerHTML, /1 shelf\b/, 'singular for one');

  for (let i = 0; i < 3; i++) c.addShelf();
  c.renderPlacedShelves();
  assert.match(host.innerHTML, /4 shelves/, 'the customer reads "4", they do not count boards');
});

test('every shelf gets its own row', () => {
  const { c, host } = fresh();
  for (let i = 0; i < 4; i++) c.addShelf();
  c.renderPlacedShelves();
  const rows = (host.innerHTML.match(/class="placed-row"/g) || []).length;
  assert.equal(rows, 4, 'four shelves, four rows');
});

test('a row says where the shelf is and how high, so two tiers are tellable apart', () => {
  /* Rows that all read "Shelf" would list four identical lines and teach the
     customer nothing — which is the state the 3D view was already in. */
  const { c, host } = fresh();
  c.addShelf(); c.addShelf();
  c.renderPlacedShelves();
  const rows = host.innerHTML.split('class="placed-row"').slice(1);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0], rows[1], 'the two rows are not identical text');
  for (const r of rows) {
    assert.match(r, /Back wall/, 'says which wall');
    assert.match(r, /ft up/, 'and how high');
    assert.match(r, /\d+" deep/, 'and how deep');
  }
});

test('removing from the list removes the right one', () => {
  const { c } = fresh();
  for (let i = 0; i < 3; i++) c.addShelf();
  const middle = c.shelvesData[1].cy;
  c.removeShelfIdx(1);
  assert.equal(c.shelvesData.length, 2);
  assert.ok(!c.shelvesData.some((s) => s.cy === middle), 'the one that was removed is gone');
});

test('removing keeps the selection pointing at the same shelf', () => {
  /* Off-by-one here means the customer deletes one shelf and then edits a
     different one without realising. */
  const { c } = fresh();
  for (let i = 0; i < 3; i++) c.addShelf();
  c.selectedKind = 'shelf'; c.selectedShelf = 2;
  const watched = c.shelvesData[2].cy;
  c.removeShelfIdx(0);                       // delete one BELOW the selection
  assert.equal(c.shelvesData[c.selectedShelf].cy, watched, 'still the same shelf');
  c.removeShelfIdx(c.selectedShelf);         // delete the selected one
  assert.equal(c.selectedShelf, -1, 'and nothing is selected afterwards');
});

test('the REAL syncEditorPanel refreshes the list, not just each caller', () => {
  /* Shelves change from six different functions — add, remove, depth, wall,
     length, drag — and every one of them already calls syncEditorPanel. A
     list that only refreshes on the paths someone remembered is a list that
     lies, which is worse than no list at all.

     This calls the real syncEditorPanel. Stubbing it, which the fixture used
     to do, made this test pass against a version with no hook at all. */
  const { c, host } = fresh();
  assert.equal(typeof c.syncEditorPanel, 'function', 'not stubbed by the fixture');
  c.shelvesData.push({ wall:'back', pos:0.5, cy:48, depth:16, len:12 });
  c.shelvesData.push({ wall:'left', pos:0.5, cy:60, depth:24, len:10 });
  host.innerHTML = 'stale';
  c.syncEditorPanel();
  assert.match(host.innerHTML, /2 shelves/, 'the list caught up without being called directly');
});
