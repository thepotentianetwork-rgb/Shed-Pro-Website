/* INTERIOR FRAMING — every style, every opening, framed like a real shed.
 *
 * Nando's photos of a built shed: 2x4 studs on 16in centres, double top
 * plate, bottom plate; each door and window has a header, king and jack
 * studs and cripples (and a rough sill under windows); rafters with collar
 * ties overhead. The 3- and 4-peak interiors used to be a flat OSB lid with
 * no roof framing at all, and studs were laid out without regard to the
 * openings.
 *
 * These tests fire rays from inside the shed at the framing meshes only. The
 * opening is found from the window's own glass and the door's own data, not
 * from the numbers the framer used.
 *
 * Run: node --test tests/geometry/interiorframing.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const IN = 0.2 / 12;

const STYLES = {
  gable: { W: 12, L: 16, PITCH: 8 }, '3peak': { W: 12, L: 16, PITCH: 8 }, '4peak': { W: 12, L: 16, PITCH: 8 },
  barn: { W: 10, L: 16, PITCH: 6 }, leanto: { W: 12, L: 10, PITCH: 6 }, hip: { W: 12, L: 12, PITCH: 6 },
};

function build(style) {
  Object.assign(c, { STYLE: style, H: 8, INSIDE_VIEW: true, INT_FINISH: 'none', ELEC: 'none', OVTYPE: 'all4', OVH: 12,
    ROOFTYPE: 'shingle', SIDING: 'vertical', PORCH_LOC: 'none', SIDE_PORCH: 0, EDIT_MODE: false, selectedKind: '',
    selectedWindow: -1, selectedDoor: -1, selectedVent: -1, selectedShelf: -1, selectedPorchLight: -1,
    doorsData: [{ wall: 'front', pos: 0.5, style: 'basic', w: 60, h: 76 }],
    windowsData: [{ wall: 'left', pos: 0.5, w: 24, h: 36, cy: 58, type: 'White Vinyl 24x36' }],
    ventsData: [], shelvesData: [] }, STYLES[style]);
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  const framing = [], glass = [];
  c.shedGroup.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.framing) framing.push(o);
    else if (o.material && o.material.transparent && o.material.opacity < 0.2) glass.push(new T.Box3().setFromObject(o));
  });
  const win = glass.find(b => b.max.x - b.min.x < 0.01 && b.min.x < 0);
  return { framing, win };
}
function hits(framing, from, dir, far) {
  const rc = new T.Raycaster(new T.Vector3(...from), new T.Vector3(...dir).normalize(), 0, far);
  return rc.intersectObjects(framing, false);
}

for (const style of Object.keys(STYLES)) {
  test(`${style}: framing is built from merged members, not one mesh per stick`, () => {
    const { framing } = build(style);
    assert.ok(framing.length >= 1 && framing.length <= 4, `framing meshes: ${framing.length}`);
  });

  test(`${style}: the side window is framed — header and sill — with nothing through the glass`, () => {
    const { framing, win } = build(style);
    assert.ok(win, 'found the window glass');
    const x = win.min.x, far = Math.abs(x) + 0.02;
    const z0 = win.min.z + IN, z1 = win.max.z - IN, y0 = win.min.y + IN, y1 = win.max.y - IN;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const z = z0 + (z1 - z0) * i / 4, y = y0 + (y1 - y0) * j / 4;
      assert.equal(hits(framing, [0, y, z], [-1, 0, 0], far).length, 0, `framing across the window at z=${z.toFixed(3)} y=${y.toFixed(3)}`);
    }
    const zc = (win.min.z + win.max.z) / 2;
    const above = [1, 2, 3, 4, 5].some(k => hits(framing, [0, win.max.y + k * IN, zc], [-1, 0, 0], far).length);
    const below = [1, 2, 3, 4, 5].some(k => hits(framing, [0, win.min.y - k * IN, zc], [-1, 0, 0], far).length);
    assert.ok(above, 'no header over the window');
    assert.ok(below, 'no rough sill under the window');
    // king/jack beside it
    const side = [1, 2, 3, 4].some(k => hits(framing, [0, (win.min.y + win.max.y) / 2, win.max.z + k * IN], [-1, 0, 0], far).length);
    assert.ok(side, 'no jack/king stud beside the window');
  });

  test(`${style}: the door opening is clear and has a header`, () => {
    const { framing, win } = build(style);
    const base = win.min.y - (58 - 18) * IN;             // the floor, from the window
    const zDoor = c.encLft() * 0.2 / 2, far = zDoor + 0.02;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
      const x = (-30 + 3 + 54 * i / 6) * IN, y = base + (3 + 70 * j / 6) * IN;
      assert.equal(hits(framing, [x, y, 0], [0, 0, 1], far).length, 0, `framing across the door at x=${x.toFixed(3)} y=${y.toFixed(3)}`);
    }
    const hdr = [2, 4, 6, 8].some(k => hits(framing, [0, base + (76 + k) * IN, 0], [0, 0, 1], far).length);
    assert.ok(hdr, 'no header over the door');
  });

  if (style !== 'leanto') test(`${style}: rafters overhead — a ray along the shed under the roof crosses framing`, () => {
    const { framing } = build(style);
    const L = c.encLft() * 0.2, wallTop = (c.H * 12 + 4) * IN;
    let n = 0;
    for (let y = wallTop; y < wallTop + 1.2; y += 0.01) n = Math.max(n, hits(framing, [c.encWft() * 0.2 / 5, y, -L / 2 + 0.15], [0, 0, 1], L - 0.3).length);
    assert.ok(n >= 4, `only ${n} framing hits overhead`);
  });
}

test('3- and 4-peak: the cross gables are framed too — a ray across the cross gable crosses rafters', () => {
  for (const style of ['3peak', '4peak']) {
    build(style);
    const g = c.crossGableGeom();
    const { framing } = build(style);
    const Wd = c.encWft() * 0.2, wallTop = (c.H * 12 + 4) * IN;
    let n = 0;
    // Close to the cross ridge, so the jacks are not yet cut short by the valley.
    for (let y = wallTop + 0.1; y < wallTop + 1.2; y += 0.01) n = Math.max(n, hits(framing, [-Wd / 2 + 0.15, y, g.zc + 0.1], [1, 0, 0], Wd - 0.21).length);
    assert.ok(n >= 3, `${style}: only ${n} framing hits across the cross gable`);
  }
});
