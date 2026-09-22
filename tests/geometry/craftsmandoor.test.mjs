/* A CRAFTSMAN DOOR IS A SPECIFIC THING.
 *
 * This one was a perimeter frame with two cross rails — a plain three-panel
 * door wearing the name. What makes a door read Craftsman, in order of how
 * much work each part does:
 *
 *   1. A row of small LITES across the top. Three narrow ones, not one wide
 *      pane: the divisions are the point.
 *   2. A DENTIL SHELF under the glass — a shelf that actually projects from
 *      the face, with small blocks beneath it. This is the signature, and it
 *      is the part that cannot be faked with a line, because a line is what
 *      the old door already had.
 *   3. Flat panels below, plain and tall.
 *
 * So the tests look for those three things as geometry — glass up top, a part
 * standing proud of the trim plane, blocks under it — rather than counting
 * meshes, which a three-panel door would also pass.
 *
 * Run: node --test tests/geometry/craftsmandoor.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const INCH = 0.2/12;

function build(style, w) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    windowsData:[], ventsData:[], shelvesData:[], ADDONS:{},
    doorsData:[{ wall:'front', pos:0.5, w:w||36, h:80, style, color:'white' }] });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return meshes(c);
}
const doorParts = (m) => m.filter(x => { let p=x.obj; while(p){ if(p.userData&&p.userData.isDoor) return true; p=p.parent; } return false; });
function doorBox(parts) {
  return { x0:Math.min(...parts.map(v=>v.min.x)), x1:Math.max(...parts.map(v=>v.max.x)),
           y0:Math.min(...parts.map(v=>v.min.y)), y1:Math.max(...parts.map(v=>v.max.y)),
           z1:Math.max(...parts.map(v=>v.max.z)) };
}
// Glass is the only thing on the door built as a PlaneGeometry.
const glassOf = (parts) => parts.filter(x => x.type === 'PlaneGeometry');

test('the top of the door is glazed', () => {
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const glass = glassOf(parts);
  assert.ok(glass.length, 'there is glass on the door at all');
  const top = Math.max(...glass.map(g => g.max.y));
  const h = b.y1 - b.y0;
  assert.ok(top > b.y0 + h * 0.7, `the glass is up at the top (${((top-b.y0)/h*100).toFixed(0)}% up the door)`);
});

test('the glass is divided into three lites, not left as one pane', () => {
  /* The divisions are what makes it Craftsman rather than a lite-over-panel
     door, so this counts the muntins crossing the glass band. */
  const parts = doorParts(build('craftsman'));
  const glass = glassOf(parts);
  const gTop = Math.max(...glass.map(g => g.max.y));
  const gBot = Math.min(...glass.map(g => g.min.y));
  const gMid = (gTop + gBot) / 2;
  const gx0 = Math.min(...glass.map(g => g.min.x));
  const gx1 = Math.max(...glass.map(g => g.max.x));
  const band = gTop - gBot;
  /* A muntin is as tall as the GLASS BAND and no taller. Without the upper
     bound the door's own full-height stiles pass too — they cross the band's
     middle and are just as narrow — and the count comes out at six. */
  const muntins = parts.filter(x => x.type === 'BoxGeometry'
    && x.min.y < gMid && x.max.y > gMid
    && (x.max.y - x.min.y) > band * 0.6 && (x.max.y - x.min.y) < band * 1.3
    && (x.max.x - x.min.x) < 0.05
    && x.min.x > gx0 - 0.01 && x.max.x < gx1 + 0.01);
  assert.equal(muntins.length, 2, `two muntins make three lites (found ${muntins.length})`);
  // Measured against the GLASS, which is what they divide — not the door box,
  // which includes the casing and the stiles outside it.
  const xs = muntins.map(mn => (mn.min.x + mn.max.x) / 2).sort((p, q) => p - q);
  const third = (gx1 - gx0) / 3;
  assert.ok(Math.abs((xs[1] - xs[0]) - third) < third * 0.15,
    `evenly spaced across the glass (${(xs[1]-xs[0]).toFixed(4)} apart, a third is ${third.toFixed(4)})`);
  assert.ok(Math.abs((xs[0] + xs[1]) / 2 - (gx0 + gx1) / 2) < 0.005, 'and centred');
});

test('the dentil shelf actually projects from the face', () => {
  /* The signature, and the part a line cannot do. Anything at the trim plane
     is a line; the shelf has to stand in front of it. */
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const trim = parts.filter(x => x.type === 'BoxGeometry' && (x.max.x - x.min.x) > 0.2);
  const faces = trim.map(x => x.max.z).sort((p, q) => q - p);
  const proud = faces[0] - faces[faces.length - 1];
  assert.ok(proud > 0.015,
    `something wide stands clear of the trim plane by ${(proud/INCH).toFixed(1)}in`);
  // and it sits below the glass, not somewhere else on the door
  const glass = glassOf(parts);
  const gBot = Math.min(...glass.map(g => g.min.y));
  const shelf = trim.filter(x => Math.abs(x.max.z - faces[0]) < 1e-6)[0];
  assert.ok(shelf.max.y <= gBot + 0.02, 'the shelf is under the glass');
  assert.ok(shelf.min.y > b.y0 + (b.y1 - b.y0) * 0.4, 'and up in the top half, where it belongs');
});

test('there are dentil blocks under the shelf', () => {
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const trim = parts.filter(x => x.type === 'BoxGeometry' && (x.max.x - x.min.x) > 0.2);
  const shelfY = Math.min(...trim.filter(x => x.max.z === Math.max(...trim.map(t => t.max.z))).map(x => x.min.y));
  const blocks = parts.filter(x => x.type === 'BoxGeometry'
    && x.max.y <= shelfY + 1e-3 && x.max.y > shelfY - 0.05
    && (x.max.x - x.min.x) < 0.09 && (x.max.y - x.min.y) < 0.03);
  assert.ok(blocks.length >= 3, `a row of blocks beneath it (found ${blocks.length})`);
  const xs = blocks.map(v => (v.min.x + v.max.x) / 2).sort((p, q) => p - q);
  const gaps = xs.slice(1).map((v, i) => v - xs[i]);
  const spread = Math.max(...gaps) - Math.min(...gaps);
  assert.ok(spread < 0.01, `evenly spaced (gaps vary by ${(spread/INCH).toFixed(2)}in)`);
});

test('the panels below are split in two', () => {
  const parts = doorParts(build('craftsman'));
  const b = doorBox(parts);
  const lowMid = b.y0 + (b.y1 - b.y0) * 0.3;
  const centre = (b.x0 + b.x1) / 2;
  const mullion = parts.filter(x => x.type === 'BoxGeometry'
    && x.min.y < lowMid && x.max.y > lowMid
    && (x.max.x - x.min.x) < 0.05
    && Math.abs((x.min.x + x.max.x) / 2 - centre) < 0.02);
  assert.ok(mullion.length >= 1, 'a centre mullion divides the lower half');
});

test('it no longer looks like the plain door', () => {
  // The old craftsman was a frame and two rails, which is what 'basic' already
  // is plus lines. If these two ever converge again, something has been undone.
  const craft = doorParts(build('craftsman'));
  const basic = doorParts(build('basic'));
  assert.ok(glassOf(craft).length > glassOf(basic).length, 'only one of them is glazed');
  assert.ok(craft.length > basic.length + 5,
    `and it carries real detail (${craft.length} parts against ${basic.length})`);
});

test('it holds together on a wide leaf as well as a narrow one', () => {
  for (const w of [30, 36, 48, 60]) {
    const parts = doorParts(build('craftsman', w));
    const b = doorBox(parts);
    const glass = glassOf(parts);
    assert.ok(glass.length, `${w}in: still glazed`);
    const gBot = Math.min(...glass.map(g => g.min.y));
    assert.ok(gBot > b.y0 + (b.y1 - b.y0) * 0.55,
      `${w}in: the glass stays a band at the top, not half the door`);
  }
});
