/* PORCH ADDS TO THE SHED. The size picked is the enclosed shed; a full porch
 * is built beyond it, and never counts toward its square footage. Saved
 * designs with a full porch and no porchAdds flag keep the old rule.
 * Run: node --test tests/ui/porchadds.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner({ porchAdds: true });
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
function reset() {
  Object.assign(c, { STYLE:'gable', W:12, L:16, H:8, PORCH_LOC:'none', SIDE_PORCH:0, PORCH_LEN:0, PORCH_OFF:0,
    PORCH_ADDS:true, _PORCH_ADD_EAT:{w:0,l:0} });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed();
}
const build = () => { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); };

test('a 12x16 with a 4ft front porch is 12x16 enclosed on a 12x20 footprint', () => {
  reset();
  Object.assign(c, { PORCH_LOC:'front', SIDE_PORCH:4 }); build();
  assert.deepEqual([c.W, c.L], [12, 20]);
  assert.deepEqual([c.shedSizeW(), c.shedSizeL()], [12, 16]);
  assert.deepEqual([c.encWft(), c.encLft()], [12, 16]);
  assert.equal(c.enclosedSqft(), 192);
  assert.equal(c.padSqft(), 192, 'gravel/pad rule reads the enclosed shed');
  assert.equal(c.gravelUnavailable(), false, '192 sq ft stays under the 200 gravel cap');
});

test('side porch adds to the width; removing it gives the size back', () => {
  reset();
  Object.assign(c, { PORCH_LOC:'side', SIDE_PORCH:6 }); build();
  assert.deepEqual([c.W, c.L, c.shedSizeW()], [18, 16, 12]);
  Object.assign(c, { SIDE_PORCH:4 }); build();
  assert.equal(c.W, 16);
  Object.assign(c, { PORCH_LOC:'none', SIDE_PORCH:0 }); build();
  assert.deepEqual([c.W, c.L], [12, 16]);
});

test('config carries porchAdds + enclosed size only when there is a full porch', () => {
  reset();
  let cfg = c.getDesignConfig();
  assert.ok(!('porchAdds' in cfg) && !('trimFinish' in cfg));
  Object.assign(c, { PORCH_LOC:'front', SIDE_PORCH:4 }); build();
  cfg = c.getDesignConfig();
  assert.equal(cfg.porchAdds, 1); assert.equal(cfg.l, 20); assert.equal(cfg.shedL, 16);
});

test('a saved design without porchAdds opens the old way: porch inside w x l', () => {
  reset();
  c.applyDesignConfig({ v:1, style:'gable', w:12, l:16, h:8, porchLoc:'front', porchDepth:4 });
  assert.equal(c.PORCH_ADDS, false);
  assert.deepEqual([c.W, c.L, c.encLft()], [12, 16, 12]);
  build();
  assert.deepEqual([c.W, c.L], [12, 16], 'rebuilding must not grow an old design');
  c.applyDesignConfig({ v:1, style:'gable', w:12, l:20, h:8, porchLoc:'front', porchDepth:4, porchAdds:1 });
  build();
  assert.deepEqual([c.W, c.L, c.encLft(), c.PORCH_ADDS], [12, 20, 16, true]);
});

test('wood-stain trim saves its finish and stain', () => {
  reset();
  c.setTrimStain('walnut');
  const cfg = c.getDesignConfig();
  assert.equal(cfg.trimFinish, 'stain'); assert.equal(cfg.trimStain, 'walnut'); assert.equal(cfg.trimStainName, 'Walnut');
  c.applyDesignConfig({ v:1, style:'gable', w:12, l:16 });
  assert.equal(c.TRIM_FINISH, 'paint', 'a design saved without a trim finish opens painted');
});
