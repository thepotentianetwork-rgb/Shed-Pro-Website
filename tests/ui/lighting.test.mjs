/* THE DAYLIGHT RIG.
 *
 * Two things, and the second is the one this file exists for.
 *
 * 1. The sun must not be in line with the default camera. It was: the sun sat
 *    at 32.5 degrees of azimuth and the default camera at 34.4, so both walls
 *    a customer could see got the same light and the shed read as a flat
 *    cut-out. Measured wall contrast at that view was 5.2, against 26.0 from a
 *    turned angle. No rig tuning fixes that, because the problem is not the
 *    rig.
 *
 * 2. The rig must be ONE table. The numbers live in init(), which builds the
 *    lights, and again in applyLighting()'s DAY branch, which resets them on
 *    every rebuild — so the second copy is the one that ends up on screen and
 *    the first is the one people read. The intensities were pulled into
 *    DAY_RIG once already; the POSITIONS were left as literals, which is the
 *    same bug with half of it fixed. The harness stubbed `position.set` as a
 *    no-op, so nothing could have caught it.
 *
 * Run: node --test tests/ui/lighting.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const DEG = 180 / Math.PI;
const azimuth = (x, z) => Math.atan2(x, z) * DEG;   // matches updateCamera's convention

test('the rig is a table, not numbers scattered through two functions', () => {
  assert.ok(c.DAY_RIG, 'DAY_RIG exists');
  for (const k of ['amb', 'hemi', 'sun', 'fill', 'rim', 'exposure', 'sunPos', 'fillPos']) {
    assert.ok(c.DAY_RIG[k] !== undefined, `DAY_RIG carries ${k}`);
  }
});

test('applyLighting puts the sun where DAY_RIG says, not where a literal says', () => {
  /* The real check. applyLighting is what runs on every rebuild, so if it
     carries its own copy of the position this is where the two diverge.

     It wants a scene to hang fog on and a renderer to set a clear colour on;
     everything else it touches is optional and guarded. */
  const T = c.THREE;
  c.scene = new T.Scene();
  c.renderer = { setClearColor(){}, toneMappingExposure: 1 };
  c.ELEC = 'none';                       // or it goes off to build light fixtures
  c.__stubLights();
  c.DAY_RIG.sunPos = [1, 2, 3];          // a value no literal in the file has
  c.DAY_RIG.fillPos = [-4, 5, -6];
  c.applyLighting();
  assert.deepEqual([c.sunLight.position.x, c.sunLight.position.y, c.sunLight.position.z],
    [1, 2, 3], 'the sun follows the table');
  assert.deepEqual([c.fillLight.position.x, c.fillLight.position.y, c.fillLight.position.z],
    [-4, 5, -6], 'and so does the fill');
});

test('the sun is not in line with the default camera', () => {
  /* Freshly loaded, so the table is the shipped one rather than the one the
     test above scribbled on. */
  const { c: fresh } = loadDesigner();
  const [sx, , sz] = fresh.DAY_RIG.sunPos;
  const sunAz = azimuth(sx, sz);
  const camAz = fresh.theta * DEG;        // updateCamera: x=r·sinφ·sinθ, z=r·sinφ·cosθ
  let gap = Math.abs(sunAz - camAz) % 360;
  if (gap > 180) gap = 360 - gap;
  assert.ok(gap > 25,
    `the sun (${sunAz.toFixed(1)}°) and the default camera (${camAz.toFixed(1)}°) are ` +
    `${gap.toFixed(1)}° apart — under 25° both visible walls light the same and the ` +
    `shed reads flat from the one view every customer sees`);
});

test('the sun still lights the wall the doors are on', () => {
  /* The trap in fixing the above by numbers alone. Swinging the sun round to
     80 degrees measures BETTER — more wall contrast at both camera angles —
     and looks worse, because the wall it throws into shade is the front. A
     picture whose job is selling doors should not hide them.

     The front faces +z, so the sun needs a positive z to light it. */
  const { c: fresh } = loadDesigner();
  const [sx, , sz] = fresh.DAY_RIG.sunPos;
  assert.ok(sz > 0, `the sun is in front of the building (z=${sz}), not behind it`);
  const lenSq = Math.hypot(sx, sz);
  assert.ok(sz / lenSq > 0.5,
    `and square enough onto the front to light it (N·L ${(sz/lenSq).toFixed(2)} across the plan)`);
});

test('the sun is high enough to light the roof', () => {
  const { c: fresh } = loadDesigner();
  const [sx, sy, sz] = fresh.DAY_RIG.sunPos;
  const elevation = Math.atan2(sy, Math.hypot(sx, sz)) * DEG;
  assert.ok(elevation > 15 && elevation < 45,
    `${elevation.toFixed(1)}° above the horizon — below 15 it grazes the roof and ` +
    `barely lights it, above 45 the walls go flat`);
});
