/* A DOUBLE DOOR IN A SHORT PORCH BECOMES A SINGLE.
 *
 * Nando: "When going to a 4' porch, put a single door instead of double door."
 * A 4ft porch has too little stepped-in wall for any double plus its casing,
 * so the porch's door becomes the matching single (same series), the double
 * is remembered and put back when the porch is lengthened — unless the
 * customer changed the door in between — and the picker greys out doubles
 * the porch can't take.
 *   node --test tests/geometry/porchsingledoor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const toasts = [];
c.showToast = (m) => { toasts.push(String(m)); };

function setup(cfg, doors) {
  Object.assign(c, { STYLE:'gable', W:10, L:20, H:8, PITCH:6, OVTYPE:'all4', OVH:4,
    PORCH_H:0, ROOFTYPE:'shingle', INSIDE_VIEW:false, PORCH_LOC:'none', SIDE_PORCH:0,
    PORCH_LEN:0, PORCH_OFF:0, DORMER_L:0, DORMER_R:0, DORMER_L_OFF:0, DORMER_R_OFF:0 }, cfg);
  c.doorsData.length = 0; (doors || []).forEach(d => c.doorsData.push(Object.assign({}, d)));
  c.windowsData.length = 0;
  toasts.length = 0;
  rebuild();
}
function rebuild() { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); }
const SIDE4 = { PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:8 };
const FRONT4 = { W:12, L:16, PORCH_LOC:'front', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:4 };
const d0 = () => c.doorsData[0];
function centre(dd) { return c.posToAxis(dd.wall, dd.pos, dd.w); }
function inGap(dd) {
  const r = c.porchRect(), g = c.porchWallGaps()[r.wall], x = centre(dd);
  return dd.wall === r.wall && x > g[0] && x < g[1];
}

test('4x4 side porch: a 5ft craftsman double becomes a 3ft craftsman single, in the porch', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:60, h:76 }]);
  assert.equal(d0().style, 'craftsman'); assert.equal(d0().w, 36); assert.equal(d0().h, 76);
  assert.ok(inGap(d0()), 'the single sits in the porch');
  assert.deepEqual(JSON.parse(JSON.stringify(d0().porchSwap.as)), { style:'craftsman', w:36 });
  assert.equal(d0().porchSwap.w, 60);
  assert.equal(toasts.filter(t => /single door to fit the 4 ft porch/.test(t)).length, 1, toasts.join(' | '));
  assert.ok(!toasts.some(t => /moved|Moved/.test(t)), 'no second "moved" toast: ' + toasts.join(' | '));
  rebuild();                                                   // a re-build changes nothing, says nothing
  assert.equal(d0().w, 36); assert.equal(toasts.length, 1);
});

test('4ft front porch: 6ft and 7ft doubles become singles too', () => {
  for (const w of [72, 84]) {
    setup(FRONT4, [{ wall:'front', pos:0.5, style:'xtrim', w, h: w === 84 ? 84 : 76 }]);
    assert.equal(d0().style, 'xtrim'); assert.equal(d0().w, 36); assert.equal(d0().h, 76);
    assert.ok(inGap(d0()));
  }
});

test('residential, slider and cedar doubles map to their single', () => {
  const cases = [['resDouble', 72, 82.5, 'res6'], ['resDoubleFull', 72, 82.5, 'resfull'],
    ['resDoubleFullB', 72, 82.5, 'resfullB'], ['slideglass', 70, 80, 'resfull'],
    ['slideglassB', 70, 80, 'resfullB'], ['cedar', 72, 76, 'cedarSingle']];
  for (const [st, w, h, want] of cases) {
    setup(SIDE4, [{ wall:'right', pos:0.5, style:st, w, h }]);
    assert.equal(d0().style, want, st); assert.equal(d0().w, 36);
  }
});

test('singles, roll-ups and the fairytale door are left alone', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:36, h:76 }]);
  assert.equal(d0().w, 36); assert.ok(!d0().porchSwap);
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'rollup', w:72, h:84, color:'white' }]);
  assert.equal(d0().style, 'rollup'); assert.equal(d0().w, 72); assert.ok(!d0().porchSwap);
  assert.ok(!inGap(d0()), 'a roll-up still slides clear of the porch as before');
});

test('a 6ft porch takes a 5ft double: no swap', () => {
  setup({ ...SIDE4, PORCH_LEN:6, PORCH_OFF:7 }, [{ wall:'right', pos:0.5, style:'basic', w:60, h:76 }]);
  assert.equal(d0().w, 60); assert.ok(!d0().porchSwap);
});

test('lengthening to 8ft puts the double back; to 6ft only if it fits', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:72, h:76 }]);
  assert.equal(d0().w, 36);
  c.setPorchLen(6);                                         // a 6ft double needs 8ft
  assert.equal(d0().w, 36, 'still single at 6ft');
  toasts.length = 0;
  c.setPorchLen(8);
  assert.equal(d0().style, 'craftsman'); assert.equal(d0().w, 72); assert.equal(d0().h, 76);
  assert.ok(!d0().porchSwap); assert.ok(inGap(d0()), 'the double is in the porch');
  assert.ok(toasts.some(t => /double door back/.test(t)), toasts.join(' | '));
  c.setPorchLen(4);
  assert.equal(d0().w, 36, 'and back to single at 4ft');
});

test('no restore if the customer changed the door meanwhile', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:60, h:76 }]);
  d0().style = 'arch';                                      // they picked another single
  c.setPorchLen(8);
  assert.equal(d0().style, 'arch'); assert.equal(d0().w, 36); assert.ok(!d0().porchSwap);
});

test('removing the porch, or making it full length, restores the double', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:60, h:76 }]);
  c.PORCH_LEN = 0; c.PORCH_OFF = 0; rebuild();             // full-length side porch
  assert.equal(d0().w, 60);
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'resDoubleFull', w:72, h:82.5 }]);
  c.PORCH_LOC = 'none'; c.SIDE_PORCH = 0; rebuild();
  assert.equal(d0().style, 'resDoubleFull'); assert.equal(d0().w, 72);
});

test('a saved design keeps the memory: reload at 4ft, lengthen, double returns', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:60, h:76 }]);
  const saved = JSON.parse(JSON.stringify(c.getDesignConfig()));
  assert.ok(saved.doors[0].porchSwap, 'porchSwap is in the saved config');
  setup({}, []);
  c.__stubLights(); try { c.applyDesignConfig(saved); } catch (e) {}
  rebuild();
  assert.equal(d0().w, 36);
  c.setPorchLen(8);
  assert.equal(d0().w, 60);
});

test('a saved design from before this change, a double in a 4ft porch, loads with the single', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:36, h:76 }]);
  const saved = JSON.parse(JSON.stringify(c.getDesignConfig()));
  saved.doors = [{ wall:'right', pos:0.5, style:'panel4', w:60, h:76 }];   // no porchSwap: never swapped
  setup({}, []);
  c.__stubLights(); try { c.applyDesignConfig(saved); } catch (e) {}
  rebuild();
  assert.equal(c.PORCH_LEN, 4);
  assert.equal(d0().style, 'panel4'); assert.equal(d0().w, 36);
  c.setPorchLen(8);
  assert.equal(d0().w, 60, 'and the double they saved comes back when there is room');
});

test('a double outside the porch on the porch wall is the one brought in as a single', () => {
  setup({ W:12, L:20, PORCH_LOC:'side', SIDE_PORCH:4, PORCH_LEN:4, PORCH_OFF:0 },
    [{ wall:'right', pos:0.85, style:'basic', w:60, h:76 }]);
  assert.equal(d0().w, 36); assert.ok(inGap(d0()));
});

test('picker: doubles greyed for the 4ft porch door, singles not; fine at 8ft', () => {
  setup(SIDE4, [{ wall:'right', pos:0.5, style:'craftsman', w:36, h:76 }]);
  c.WIZ_ADDWALL_DOOR = 'right'; c.ADD_ANOTHER_DOOR = false; c.selectedKind = 'door'; c.selectedDoor = 0;
  const idx = (cat) => c.DOOR_SIZES.findIndex(s => s.cat === cat);
  const dbl = c.doorOptionsHTML(idx('5double'));
  assert.ok(/porch-off/.test(dbl) && /Too wide for the 4 ft porch/.test(dbl));
  assert.ok(!/addDoorByStyle/.test(dbl), 'no live double tile');
  const sgl = c.doorOptionsHTML(idx('3single'));
  assert.ok(!/porch-off/.test(sgl) && /addDoorByStyle/.test(sgl));
  // the guard: picking a double anyway does nothing to the door
  c.addDoorByStyle('craftsman', 60, 76);
  assert.equal(d0().w, 36);
  assert.ok(toasts.some(t => /lengthen the porch or pick a single/.test(t)));
  // a different wall is unaffected
  c.WIZ_ADDWALL_DOOR = 'front'; c.selectedKind = null; c.selectedDoor = -1;
  assert.ok(!/porch-off/.test(c.doorOptionsHTML(idx('5double'))));
  // 8ft porch: the 6ft double is live again
  c.WIZ_ADDWALL_DOOR = 'right'; c.setPorchLen(8);
  assert.ok(!/porch-off/.test(c.doorOptionsHTML(idx('6double'))));
  c.selectedKind = null; c.selectedDoor = -1;
});

test('the Estate starter (single resfull on a front porch) is untouched', () => {
  setup({ W:12, L:16, PORCH_LOC:'front', SIDE_PORCH:4 }, [{ wall:'front', pos:0.5, style:'resfull', w:36, h:82.5 }]);
  assert.equal(d0().style, 'resfull'); assert.ok(!d0().porchSwap);
  c.setPorchLen(4);
  assert.equal(d0().style, 'resfull'); assert.equal(d0().w, 36); assert.ok(!d0().porchSwap);
});
