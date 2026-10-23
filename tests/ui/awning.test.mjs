/* AWNING vs PORCH (23 Oct 2026). Awning = added outside the picked size, not
 * counted in its sq ft; Porch = inside the picked size, counted.
 * Run: node --test tests/ui/awning.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner({ porchAdds: true });
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const build = () => { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); };
function reset() {
  Object.assign(c, { STYLE:'gable', W:10, L:20, H:9, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_LEN:0, PORCH_OFF:0,
    PORCH_ADDS:true, _PORCH_ADD_EAT:{w:0,l:0} });
  build();
}
c.porchRefresh = build;

test('10x20 + 4ft side awning: 10x20 enclosed, 14x20 overall, labelled as an awning', () => {
  reset(); Object.assign(c, { PORCH_LOC:'side', SIDE_PORCH:4 }); build();
  assert.deepEqual([c.W, c.L, c.shedSizeW(), c.shedSizeL()], [14, 20, 10, 20]);
  assert.equal(c.porchIsAwning(), true);
  assert.equal(c.sizeReadout(), "10\u00d720 + 4' side awning");
  assert.equal(c.porchStyleSuffix(), ' + Awning');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.porchAdds, 1); assert.equal(cfg.awning, 1);
  assert.deepEqual([cfg.shedW, cfg.shedL, cfg.w, cfg.l], [10, 20, 14, 20]);
});

test('switching to Porch keeps the 10x20 size and puts the porch inside it', () => {
  reset(); Object.assign(c, { PORCH_LOC:'side', SIDE_PORCH:4 }); build();
  c.setPorchKind('porch');
  assert.deepEqual([c.W, c.L], [10, 20]);
  assert.equal(c.porchIsAwning(), false);
  assert.equal(c.enclosedSqft(), 120);
  assert.equal(c.porchStyleSuffix(), ' + Porch');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.porchAdds, undefined); assert.equal(cfg.awning, undefined);
  c.setPorchKind('awning');
  assert.deepEqual([c.W, c.shedSizeW()], [14, 10]);
});
