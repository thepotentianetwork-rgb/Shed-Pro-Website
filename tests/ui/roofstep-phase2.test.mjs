/* ROOF BEFORE SIDING & COLOR + PHASE 2 RESIDENTIAL DOUBLE PANELS (19 Nov 2026).
 *   node --test tests/ui/roofstep-phase2.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { loadDesigner } from '../harness.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = readFileSync(join(REPO, 'designer.html'), 'utf8');
const DU_SRC = readFileSync(join(REPO, 'designer-upgrade.js'), 'utf8');
function setup() {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  return c;
}
const titles = (c) => JSON.parse(JSON.stringify(c.WIZ_STEPS.map((s) => s.title)));
function panelIndex(marker) {          // data-step of the panel whose markup holds `marker`
  const at = HTML.indexOf(marker); assert.ok(at > 0, marker);
  let n = -1;
  for (const m of HTML.slice(0, at).matchAll(/<div class="wstep[^"-]*" data-step="(\d+)"/g)) n = +m[1];
  return n;
}

test('step order: Roof comes right after Foundation, before Siding & color', () => {
  const c = setup(), t = titles(c);
  assert.deepEqual(t, ['Start your design', 'Pick your size', 'Foundation', 'Roof', 'Siding & color',
    'Doors', 'Windows & Vents', 'Interior', 'Electrical', 'Add-Ons', 'Review & quote']);
});

test('each panel carries the data-step of its title, so the right page shows on every step', () => {
  const c = setup(), t = titles(c);
  assert.equal(panelIndex('class="lbl">Roof Type<'), t.indexOf('Roof'));
  assert.equal(panelIndex('class="lbl">Siding Color<'), t.indexOf('Siding & color'));
  assert.equal(panelIndex('id="cg-r"'), t.indexOf('Siding & color'), 'colour-step roof picker stays on the colour step');
  // one panel per step, no duplicates
  const steps = [...HTML.matchAll(/<div class="wstep[^"]*" data-step="(\d+)"/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(steps, t.map((_, i) => i));
});

test('Next / Back walk Roof then Siding & color; progress bar has one segment per step', () => {
  const c = setup(), t = titles(c);
  const prog = { innerHTML: '' }, title = { textContent: '' };
  const orig = c.document.getElementById;
  c.document.getElementById = (id) => (id === 'wprog' ? prog : id === 'wStepTitle' ? title : orig.call(c.document, id));
  c.wizStep = t.indexOf('Foundation'); c.wizRender();
  c.wizNext(); assert.equal(title.textContent, 'Roof');
  assert.equal((prog.innerHTML.match(/wprog-seg/g) || []).length, t.length);
  c.wizNext(); assert.equal(title.textContent, 'Siding & color');
  c.wizNext(); assert.equal(title.textContent, 'Doors');
  c.wizPrev(); c.wizPrev(); assert.equal(title.textContent, 'Roof');
  c.wizGoTo('Siding & color'); assert.equal(c.wizStep, t.indexOf('Siding & color'));
});

test('a saved session reopens on the same page: by title, and old index saves map Siding/Roof by name', () => {
  const c = setup(); c.buildShed = () => {};
  vm.runInContext(DU_SRC, c, { filename: 'designer-upgrade.js' });
  const t = titles(c), r = (s) => c.DU.resumeStepIndex(s);
  assert.equal(r({ step: 3, stepTitle: 'Roof' }), t.indexOf('Roof'));
  assert.equal(r({ step: 4, stepTitle: 'Siding & color' }), t.indexOf('Siding & color'));
  assert.equal(r({ step: 3 }), t.indexOf('Siding & color'), 'legacy index 3 was Siding & color');
  assert.equal(r({ step: 4 }), t.indexOf('Roof'), 'legacy index 4 was Roof');
  assert.equal(r({ step: 5 }), t.indexOf('Doors'), 'other indices unchanged');
  assert.equal(r({ step: 99 }), t.length - 1);
});

test('review spec sheet lists Roof before Siding, matching the steps', () => {
  const c = setup(); c.buildShed = () => {};
  vm.runInContext(DU_SRC, c, { filename: 'designer-upgrade.js' });
  const keys = c.DU.specRows().map((r) => r[0]);
  assert.ok(keys.indexOf('Roof') < keys.indexOf('Siding'));
  assert.ok(keys.indexOf('Siding') < keys.indexOf('Doors'));
});

test('roof colour picked on the Roof step shows on the colour step (one writer, both hosts)', () => {
  const c = setup(); c.buildShed = () => {};
  const nodes = {}; const orig = c.document.getElementById;
  c.document.getElementById = (id) => (nodes[id] = nodes[id] || orig.call(c.document, id));
  const pick = c.SHINGLE_COLORS[c.SHINGLE_COLORS.length - 1];
  c.ROOFTYPE = 'shingle'; c.setColor('r', pick.hex, pick.name);
  assert.equal(c.rc, pick.hex);
  assert.match(String(c.roofColorStripHTML()), new RegExp(pick.name));
});

// ---- Phase 2: residential double raised panels ----
function withDoor(c, style, w, h) {
  c.doorsData.length = 0; c.doorsData.push({ wall: 'front', pos: 0.5, style, w, h: h || 82.5 });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed();
}
const panels = (c) => { const o = []; c.shedGroup.traverse((m) => { if (m.isMesh && m.userData.raisedPanel) o.push(m); }); return o; };

test('6-panel residential double: six raised panels per leaf, recessed below the stile face', () => {
  const c = setup();
  withDoor(c, 'resDouble', 72);
  const p = panels(c);
  assert.equal(p.length, 12);
  c.shedGroup.updateMatrixWorld(true);
  for (const m of p) {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    const front = m.position.z + b.max.z, base = m.position.z;
    assert.ok(front < 0.025 - 0.002, 'field sits below the stile face');
    assert.ok(front > 0.015 + 0.004, 'and stands up off the recess floor');
    assert.ok(m.geometry.parameters.options.bevelEnabled, 'bevelled edges');
    assert.ok(base <= 0.015 + 1e-9);
  }
});

test('other doors are unchanged: full-lite residential double, 6-panel single, Basic double', () => {
  const c = setup();
  for (const [st, w] of [['resDoubleFull', 72], ['res6', 36], ['basic', 72]]) {
    withDoor(c, st, w, st === 'basic' ? 76 : 82.5);
    assert.equal(panels(c).length, 0, st);
  }
});
