/* SIDE PORCH — THE DOOR NEVER LANDS ON A WINDOW.
 *
 * Nando (16 Nov): "In the side porch style the door and window overlap."
 * Picking the Side porch moves the door onto the porch wall, where the
 * starter window already sits centred. With no gap beside it the slot finder
 * returned null and the door was dropped at pos 0.5 — on top of the window —
 * on every shed up to 20ft long; at 22-24ft the gap it found was measured in
 * pos x length while the model is drawn with posToAxis, so the door still
 * covered the window by a few inches.
 *
 * These measure where the openings are DRAWN (posToAxis, casings included),
 * on every wall, after the porch is picked: every length, door width, window
 * size, one or two windows, full or partial porch, and both porch modes.
 *   node --test tests/ui/porchdoorwindow.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const IN = 0.2 / 12;

function setup(porchAdds) {
  const { c } = loadDesigner({ porchAdds });
  const T = c.THREE;
  c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
  c.__stubLights();
  return c;
}
function drawn(c) {
  const b = [];
  c.doorsData.forEach((d, i) => b.push({ k: 'door' + i, wall: d.wall, c: c.posToAxis(d.wall, d.pos, d.w),
    half: d.w * IN / 2 + 0.07, y0: 0, y1: d.h }));
  c.windowsData.forEach((d, i) => { const cy = d.cy == null ? 52 : d.cy;
    b.push({ k: 'win' + i, wall: d.wall, c: c.posToAxis(d.wall, d.pos, d.w),
      half: d.w * IN / 2 + 0.055, y0: cy - d.h / 2, y1: cy + d.h / 2 }); });
  return b;
}
function overlaps(c) {
  const b = drawn(c), bad = [];
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const p = b[i], q = b[j];
    if (p.wall !== q.wall || !(p.y1 > q.y0 && q.y1 > p.y0)) continue;
    const ov = p.half + q.half - Math.abs(p.c - q.c);
    if (ov > 1e-4) bad.push(`${p.wall}: ${p.k} and ${q.k} overlap ${(ov / IN).toFixed(1)}in`);
  }
  for (const p of b) {
    const f = c.wallFrame(p.wall), lo = f.ctr - f.len / 2, hi = f.ctr + f.len / 2;
    if (p.c - p.half < lo - 1e-4 || p.c + p.half > hi + 1e-4) bad.push(`${p.wall}: ${p.k} runs past the corner`);
  }
  return bad;
}
function start(c, L, opts) {
  Object.assign(c, { STYLE: 'gable', W: 12, L, H: 8, PORCH_LOC: 'none', SIDE_PORCH: 0, PORCH_LEN: 0, PORCH_OFF: 0 });
  c.doorsData.length = 0; c.windowsData.length = 0;
  c.doorsData.push({ wall: 'front', style: 'basic', w: opts.door, h: 76, pos: 0.5 });
  c.windowsData.push({ wall: 'left', w: opts.win, h: 36, pos: 0.5, cy: 52 });
  if (opts.n === 1) c.windowsData.push({ wall: 'right', w: opts.win, h: 36, pos: 0.5, cy: 52 });
  else {
    c.windowsData.push({ wall: 'right', w: opts.win, h: 36, pos: 0.25, cy: 52 });
    c.windowsData.push({ wall: 'right', w: opts.win, h: 36, pos: 0.75, cy: 52 });
  }
}
function rebuild(c) { c.__stubLights(); c.shedGroup.clear(); c.buildShed(); }

for (const porchAdds of [true, false]) {
  const c = setup(porchAdds);

  test(`porchAdds=${porchAdds}: the starter 10x12 Side Porch — door on the porch wall, window clear of it`, () => {
    start(c, 12, { door: 72, win: 24, n: 1 });
    c.W = 10;
    c.pickPorchStyle('side', null); rebuild(c);
    assert.equal(c.doorsData[0].wall, 'right', 'the door still moves to the porch wall');
    assert.deepEqual(overlaps(c), []);
    assert.equal(c.windowsData.length, 2, 'no window was deleted');
  });

  test(`porchAdds=${porchAdds}: no door/window overlap on any wall, any length, door, window or porch length`, () => {
    const bad = [];
    for (const L of [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 34])
      for (const door of [36, 60, 72])
        for (const win of [24, 36])
          for (const n of [1, 2])
            for (const part of [0, 4, 6]) {
              start(c, L, { door, win, n });
              if (overlaps(c).length) continue;          // only legal starting designs
              c.pickPorchStyle('side', null);
              if (part && part < L) c.setPorchLen(part);
              rebuild(c);
              for (const o of overlaps(c)) bad.push(`L${L} door${door} win${win}x${n} porch${part || 'full'}: ${o}`);
            }
    assert.deepEqual(bad.slice(0, 12), [], `${bad.length} overlapping builds`);
  });

  test(`porchAdds=${porchAdds}: changing porch depth keeps them apart`, () => {
    start(c, 12, { door: 72, win: 24, n: 1 }); c.W = 10;
    c.pickPorchStyle('side', null);
    for (const d of [4, 6, 8, 4]) { c.setPorchDepth(d); rebuild(c); assert.deepEqual(overlaps(c), [], `depth ${d}`); }
  });
}
