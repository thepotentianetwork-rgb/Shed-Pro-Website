/* 4x6 IS THE SMALLEST SHED (Nando, 20 Nov 2026: "I need to be able to go as
 * low as 4x6. Anytime it's too small for double door just replace it with a
 * man door.")
 *
 *   1. The width slider starts at 4; length still starts at 6.
 *   2. Every style builds at 4x6 with the showcase openings, a loft, a ramp
 *      and (gable) a porch: no NaN, no inside-out boxes, no throw.
 *   3. A double too wide for its wall becomes the matching single, keeps its
 *      wall and colour where it can, and comes back when the shed grows.
 *   4. A double that fits is never touched; a door nothing smaller can
 *      replace is left as it was.
 *   5. Picking a double for a wall it cannot fit places the single instead.
 *
 * Run: node --test tests/geometry/size4x6.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const toasts = [];
c.showToast = (m) => toasts.push(m);
const HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'designer.html'), 'utf8');

function base(cfg) {
  Object.assign(c, { STYLE:'gable', W:4, L:6, H:8, PITCH:6, OVTYPE:'all4', OVH:4, PORCH_H:0,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, WALLS_XRAY:false, SIDING:'vertical', PORCH_LOC:'none',
    SIDE_PORCH:0, DORMER_L:0, DORMER_R:0, FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    selectedWindow:-1, selectedDoor:-1, selectedVent:-1, selectedShelf:-1, selectedPorchLight:-1,
    LOFT:'none', ADDONS:Object.assign({}, c.ADDONS, { ramp:false }),
    windowsData:[{wall:'left',pos:0.5,w:24,h:36,cy:58,type:'Black Vinyl 24x36'},
                 {wall:'right',pos:0.5,w:24,h:36,cy:58,type:'Black Vinyl 24x36'}],
    doorsData:[{wall:'front', pos:0.5, style:'basic', w:72, h:76}],
    ventsData:[{wall:'front',pos:0.5,cy:null},{wall:'back',pos:0.5,cy:null}],
    shelvesData:[] }, cfg);
  toasts.length = 0;
}
function build() {
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
}
function sane(label) {
  let n = 0;
  c.shedGroup.traverse((o) => {
    if (!o.isMesh) return;
    n++;
    for (const e of o.matrixWorld.elements) assert.ok(Number.isFinite(e), `${label}: NaN in a mesh transform`);
    const p = o.geometry && o.geometry.parameters;
    if (p) for (const k of ['width', 'height', 'depth', 'radius']) {
      if (p[k] != null) assert.ok(Number.isFinite(p[k]) && p[k] >= 0, `${label}: ${o.geometry.type} ${k}=${p[k]}`);
    }
    const a = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (a) for (let i = 0; i < a.array.length; i += 7) assert.ok(Number.isFinite(a.array[i]), `${label}: NaN vertex`);
  });
  assert.ok(n > 50, `${label}: only ${n} meshes built`);
}

test('the width slider reaches 4ft; length still starts at 6', () => {
  const step = HTML.split('data-step="1"')[1].split('</div>\n      </div>')[0];
  const [w, l] = [...step.matchAll(/<input type="range" min="(\d+)" max="(\d+)"[^>]*step="(\d+)"/g)].map((m) => +m[1]);
  assert.equal(w, 4);
  assert.equal(l, 6);
});

for (const style of ['gable', 'barn', 'leanto', 'hip', '3peak', '4peak']) {
  test(`${style} builds sanely at 4x6, with a loft and a ramp`, () => {
    base({ STYLE:style, LOFT:'2-front', ADDONS:Object.assign({}, c.ADDONS, { ramp:true }) });
    if (typeof c.reconcileStyleOpenings === 'function') c.reconcileStyleOpenings(true);
    build();
    sane(style);
    assert.ok(Math.abs(c.wallFrame('front').len - 4*0.2) < 1e-9, `${style}: the front wall is ${c.wallFrame('front').len/0.2}ft, not 4`);
    const box = new T.Box3().setFromObject(c.shedGroup);
    assert.ok(box.max.x - box.min.x < 4*0.2 + 1.0, `${style}: the build is ${((box.max.x-box.min.x)/0.2).toFixed(1)}ft across`);
    const d = c.doorsData.find((x) => x.wall === 'front');
    assert.ok(d, 'the front door is still there');
    assert.equal(+d.w, 36, `${style}: the 6' double should be a 3' single at 4ft wide`);
  });
}

test('at 4x6 the gable vent clears the man door instead of sitting on its casing', () => {
  base();
  build();
  const v = c.ventsData[0], d = c.doorsData[0];
  const ventCasingBottom = v.cy - 4 - 3.3, doorCasingTop = d.h + 3.3;
  assert.ok(ventCasingBottom > doorCasingTop, `vent casing ${ventCasingBottom}in vs door casing ${doorCasingTop}in`);
  assert.ok(v.cy + 4 + 3.3 <= c.H*12, 'and stays under the plate');
});

test('gable 4x6 with a front porch still builds', () => {
  base({ PORCH_LOC:'front', SIDE_PORCH:4 });
  if (typeof c.clampPorch === 'function') c.clampPorch();
  build();
  sane('gable+porch');
});

test('a double too wide for the front wall becomes the same series single, and comes back', () => {
  base({ doorsData:[{wall:'front', pos:0.5, style:'craftsman', w:60, h:76}] });
  build();
  const d = c.doorsData[0];
  assert.equal(d.wall, 'front');
  assert.equal(d.style, 'craftsman');
  assert.equal(+d.w, 36);
  assert.ok(toasts.includes("Double door doesn't fit, switched to a single door."), toasts.join(' | '));
  // it is a 3' single on the price side too
  assert.equal(c.doorKindOf(d.style, +d.w), 'single');
  // grow the shed: the double comes back
  c.W = 10; build();
  assert.equal(+c.doorsData[0].w, 60);
  assert.equal(c.doorsData[0].style, 'craftsman');
  assert.equal(c.doorsData[0].fitSwap, undefined);
});

test('a residential double keeps its colour family as a single', () => {
  base({ doorsData:[{wall:'front', pos:0.5, style:'resDoubleFullB', w:72, h:82.5}] });
  build();
  assert.equal(c.doorsData[0].style, 'resfullB');
  assert.equal(+c.doorsData[0].w, 36);
});

test('a single the customer picked after the swap is kept when the shed grows', () => {
  base();
  build();
  c.doorsData[0].style = 'xtrim';            // the customer changed it
  c.W = 12; build();
  assert.equal(c.doorsData[0].style, 'xtrim');
  assert.equal(+c.doorsData[0].w, 36);
});

test('a double that fits is left alone, and so is a door with no single', () => {
  base({ W:6, doorsData:[{wall:'front', pos:0.5, style:'basic', w:60, h:76}] });
  build();
  assert.equal(+c.doorsData[0].w, 60, "a 5' double fits a 6ft wall (60+7 <= 72)");
  base({ doorsData:[{wall:'front', pos:0.5, style:'rollup', w:72, h:84, color:'white'}] });
  build();
  assert.equal(c.doorsData[0].style, 'rollup');
  assert.equal(+c.doorsData[0].w, 72);
});

test('picking a double for a 4ft wall places the single instead', () => {
  base({ doorsData:[], ventsData:[] });
  build();
  c.WIZ_ADDWALL_DOOR = 'front'; c.ADD_ANOTHER_DOOR = false;
  c.renderPlacedDoors = () => {}; c.closeSubPage = () => {}; c.syncEditorPanel = () => {};
  c.addDoorByStyle('panel4', 60, 76);
  const d = c.doorsData.find((x) => x.wall === 'front');
  assert.ok(d, 'a door was placed: ' + toasts.join(' | '));
  assert.equal(d.style, 'panel4');
  assert.equal(+d.w, 36);
  assert.equal(toasts[toasts.length - 1], "Double door doesn't fit, switched to a single door.");
});
