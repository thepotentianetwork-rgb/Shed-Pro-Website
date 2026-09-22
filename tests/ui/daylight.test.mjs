/* DAY OR NIGHT IS THE CUSTOMER'S TO CHOOSE.
 *
 * Picking any electrical package switched the scene to dusk so the lights
 * show. That is the right default and it was the only setting: a customer who
 * added a light could not see their shed in daylight again without removing
 * the package, so the siding and trim colours they had just spent time on went
 * dark the moment they bought a bulb.
 *
 * The package still decides what you see FIRST. These hold the line that it no
 * longer decides what you see after that.
 *
 * Run: node --test tests/ui/daylight.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

function fresh(elec) {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.renderer = { setClearColor(){}, toneMappingExposure: 1 };
  c.shedLights = [];
  /* setElectrical rebuilds the shed, so this needs to be a build that can
     actually be built, not just an ELEC value. */
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PITCH:6, ELEC: elec,
    OVTYPE:'all4', OVH:12, ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical',
    PORCH_LOC:'none', SIDE_PORCH:0, FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    windowsData:[], ventsData:[], shelvesData:[], doorsData:[], porchLightsData:[], ADDONS:{},
    addShedLights(){}, syncBulbVisibility(){}, syncPorchLightVisibility(){},
    showToast(){}, syncEditorPanel(){}, refreshInterior(){} });
  c.__stubLights();
  return c;
}

test('no package means daylight, and no button to argue with', () => {
  const c = fresh('none');
  assert.equal(c.nightView(), false);
});

test('choosing a package still shows the lights off at dusk', () => {
  for (const pkg of ['basic', 'core', 'essential']) {
    const c = fresh(pkg);
    assert.equal(c.nightView(), true, `${pkg} opens at dusk`);
  }
});

test('and the customer can put the sun back', () => {
  const c = fresh('core');
  assert.equal(c.nightView(), true, 'starts at dusk');
  c.toggleDaylight();
  assert.equal(c.nightView(), false, 'one tap and it is daytime');
  c.toggleDaylight();
  assert.equal(c.nightView(), true, 'and back');
});

test('the first tap is not backwards on a shed with no package', () => {
  /* DAYLIGHT starts null, meaning "follow the package". Inverting null rather
     than reading the CURRENT state would make the first tap a no-op here. */
  const c = fresh('none');
  assert.equal(c.nightView(), false);
  c.toggleDaylight();
  assert.equal(c.nightView(), true, 'day -> night, not day -> day');
});

test('dropping the package clears a forced night', () => {
  /* Otherwise you get a dark shed with no lighting in it, and the button that
     would undo it is hidden — it only shows with a package. */
  const c = fresh('core');
  c.toggleDaylight();          // force day
  c.toggleDaylight();          // force night
  assert.equal(c.nightView(), true);
  c.setElectrical('none', { classList: { add(){}, remove(){} } });
  assert.equal(c.nightView(), false, 'back to daylight with the package gone');
});

test('applyLighting reads the toggle, not the package', () => {
  /* The real wiring check: nightView() could be perfect and applyLighting
     could still be testing ELEC directly, which is how it was written. */
  const c = fresh('core');
  let clear = null;
  c.renderer.setClearColor = (hex) => { clear = hex; };
  c.applyLighting();
  const duskClear = clear;
  c.toggleDaylight();          // applyLighting runs again inside
  assert.notEqual(clear, duskClear,
    'the scene actually changed — the sky colour is not the dusk one any more');
});
