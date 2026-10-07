/* HEX COLOURS ARE sRGB.
 *
 * Every colour on the shed is an sRGB hex, and r128 has no ColorManagement:
 * a flat material colour went to the shader as if it were LINEAR, then the
 * sRGB output encoding brightened it again. Dark trim came out near white -
 * Behr Cracked Pepper (#4F5152) rendered at (217,218,217). Siding hid the
 * problem because its colour rides in on an sRGB-decoded map, but it had the
 * opposite bug: the colour was ALSO set as the material tint, so the paint
 * was multiplied in twice and a navy shed read near-black.
 *
 * These pin the fix. What it LOOKS like is measured in a real browser by
 * tests/visual/swatches.mjs (sampled pixels against each hex).
 *
 * Run: node --test tests/ui/colorspace.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

test('standard + physical shaders decode flat diffuse and emissive from sRGB', () => {
  const { c } = loadDesigner();
  c.installSRGBMaterialColors();
  for (const k of ['standard', 'physical']) {
    const f = c.THREE.ShaderLib[k].fragmentShader;
    assert.match(f, /#ifdef USE_MAP\s+vec4 diffuseColor = vec4\( diffuse, opacity \);\s+#else\s+vec4 diffuseColor = vec4\( sRGBToLinear\( vec4\( diffuse, 1\.0 \) \)\.rgb, opacity \);\s+#endif/,
      k + ': flat colour decoded, a colour map left as a plain multiplier');
    assert.ok(f.includes('vec3 totalEmissiveRadiance = sRGBToLinear( vec4( emissive, 1.0 ) ).rgb;'), k + ': emissive decoded');
    assert.ok(!f.includes('vec3 totalEmissiveRadiance = emissive;'), k + ': no undecoded emissive left');
  }
  // Idempotent: a second call must not wrap the decode in another decode.
  const once = c.THREE.ShaderLib.standard.fragmentShader;
  c.installSRGBMaterialColors();
  assert.equal(c.THREE.ShaderLib.standard.fragmentShader, once);
  assert.equal((once.match(/sRGBToLinear\( vec4\( diffuse/g) || []).length, 1);
});

test('the basic material (glass, glows, decals) is left alone', () => {
  const { c } = loadDesigner();
  const before = c.THREE.ShaderLib.basic.fragmentShader;
  c.installSRGBMaterialColors();
  assert.equal(c.THREE.ShaderLib.basic.fragmentShader, before);
});

test('init installs it before anything is drawn', () => {
  const { c } = loadDesigner();
  const src = c.init.toString();
  const at = src.indexOf('installSRGBMaterialColors()');
  assert.ok(at >= 0, 'init calls installSRGBMaterialColors');
  assert.ok(at < src.indexOf('new THREE.WebGLRenderer'), 'before the renderer exists');
});

test('siding: the map carries the paint, the tint is white (no double multiply)', () => {
  const { c } = loadDesigner();
  const navy = 0x2C3E52;
  const tex = c.makeSiding(navy, 'vertical');
  assert.equal(c.sidingMat(navy, tex).color.getHex(), 0xFFFFFF, 'textured siding is not tinted again');
  assert.equal(c.sidingMat(navy, null).color.getHex(), navy, 'without a map the colour still comes from color');
  // The dark-paint gloss rule still reads the paint, not the white tint.
  assert.ok(c.sidingMat(0x1E1E1E, c.makeSiding(0x1E1E1E, 'vertical')).roughness >
            c.sidingMat(0xF2F0EC, c.makeSiding(0xF2F0EC, 'vertical')).roughness, 'dark paint still gets the rougher finish');
});

test('a built shed: walls untinted, trim keeps its authored hex', () => {
  const { c } = loadDesigner();
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  c.sc = 0x2C3E52; c.tc = 0x4F5152;
  c.buildShed();
  const mats = [];
  c.shedGroup.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m && mats.push(m)); });
  const walls = mats.filter(m => m.map && m.map.image && m.bumpMap);
  assert.ok(walls.length > 0, 'found the siding');
  for (const m of walls) assert.equal(m.color.getHex(), 0xFFFFFF, 'siding tint');
  // material.color keeps the hex (designer-realism.js and the tests match on it);
  // the decode happens in the shader.
  assert.ok(mats.some(m => !m.map && m.color && m.color.getHex() === 0x4F5152), 'trim carries #4F5152 as authored');
});
