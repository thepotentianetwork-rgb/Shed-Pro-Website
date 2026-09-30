/* THE CEDAR SINGLE — "just like the double but single, looks the same".
 *
 * The 3D door builder decides leaf COUNT by width (isSingle = dw < 0.85, i.e.
 * under 51in) and leaf MATERIAL by style, so a cedar single is supposed to
 * need nothing in the geometry but a style id the cedar branch recognises.
 * "Supposed to" is the reason for this file: the two decisions are made in
 * different places off different inputs, and a style the material branch does
 * not know about renders a painted shed door at 36in wide without erroring —
 * one leaf, correct size, wrong product, and nothing to see in a stack trace.
 *
 * So each test pins one half against the other:
 *
 *   1. ONE leaf. Not "an odd number of boards" — a real centre mullion would
 *      leave the double's two edge stiles meeting mid-leaf, so this counts
 *      full-height boards and their x positions.
 *   2. Cedar, not paint. The leaf colour is checked against the double's own
 *      leaf colour rather than a literal, so restaining the cedar door moves
 *      both and this keeps testing "same product".
 *   3. The transom lites are there and they are GLASS you can see through,
 *      which is what makes the cedar door the cedar door.
 *   4. The catalogue round-trips: doorCatFor sends a placed cedar single back
 *      to the Cedar Single tile and a placed cedar double to the Cedar Double
 *      tile. Both cedar entries carry kind:'cedar', which is exactly the
 *      collision that used to send every residential double to "6' Double".
 *   5. The tile icon has no centre mullion, and the double's still does.
 *
 * Run: node --test tests/geometry/cedarsingle.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner, meshes } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
const INCH = 0.2 / 12;

function build(style, w, h) {
  Object.assign(c, { STYLE:'gable', W:12, L:20, H:9, PITCH:6, OVTYPE:'all4', OVH:12,
    ROOFTYPE:'shingle', INSIDE_VIEW:false, SIDING:'vertical', PORCH_LOC:'none', SIDE_PORCH:0,
    FOUNDATION:'blocks', EDIT_MODE:false, selectedKind:'',
    windowsData:[], ventsData:[], shelvesData:[], ADDONS:{},
    doorsData:[{ wall:'front', pos:0.5, w, h, style }] });
  c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true);
  return meshes(c).filter(x => { let p = x.obj; while (p) { if (p.userData && p.userData.isDoor) return true; p = p.parent; } return false; });
}

// The door's own x span, from its widest part.
const span = (parts) => ({ x0: Math.min(...parts.map(v => v.min.x)), x1: Math.max(...parts.map(v => v.max.x)),
                           y0: Math.min(...parts.map(v => v.min.y)), y1: Math.max(...parts.map(v => v.max.y)) });

/* HOW MANY LEAVES, asked of the geometry rather than of the width that made it.
   Every rail and stile on one cedar leaf is built from a single material
   instance created for that leaf, so distinct instances = distinct leaves.
   The casing and the jambs are cedar-TEXTURED (they carry a map); the leaf
   boards are flat colour, which is what separates the leaf from its surround.
   A leaf frame is then the group that has BOTH tall narrow stiles and wide
   short rails — which is what keeps the double's white centre mullion, a lone
   tall board of its own, from counting as a third leaf. */
function leafFrames(parts) {
  const b = span(parts), H = b.y1 - b.y0;
  const byMat = new Map();
  for (const v of parts) {
    const m = v.obj.material;
    if (!m || m.map) continue;
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(v);
  }
  const tall = (v) => (v.max.y - v.min.y) > H * 0.7 && (v.max.x - v.min.x) < 6 * INCH;
  const wide = (v) => (v.max.x - v.min.x) > 6 * INCH && (v.max.y - v.min.y) < 6 * INCH;
  return [...byMat.values()]
    .filter(g => g.some(tall) && g.some(wide))
    .map(g => ({ stiles: g.filter(tall).map(v => (v.min.x + v.max.x) / 2).sort((p, q) => p - q) }));
}

test('a cedar single is ONE leaf and a cedar double is two', () => {
  const singleParts = build('cedarSingle', 36, 76);
  const dblParts = build('cedar', 60, 76);
  const single = leafFrames(singleParts);
  const dbl = leafFrames(dblParts);

  assert.equal(single.length, 1, `cedar single: expected 1 leaf, got ${single.length}`);
  assert.equal(dbl.length, 2, `cedar double: expected 2 leaves, got ${dbl.length}`);
  assert.equal(single[0].stiles.length, 2, 'the single leaf should have two edge stiles');

  // And nothing stands on the single's centre line — a mullion there is the
  // failure this whole test exists for, and it would still leave one leaf.
  const b = span(singleParts);
  const mid = (b.x0 + b.x1) / 2;
  const onCentre = singleParts.filter(v =>
    Math.abs((v.min.x + v.max.x) / 2 - mid) < 1.5 * INCH &&
    (v.max.y - v.min.y) > (b.y1 - b.y0) * 0.7 && (v.max.x - v.min.x) < 6 * INCH);
  assert.equal(onCentre.length, 0, 'the cedar single has a full-height board on its centre line');

  // The double DOES carry one there — so the check above can actually fail.
  const bd = span(dblParts);
  const midD = (bd.x0 + bd.x1) / 2;
  const onCentreD = dblParts.filter(v =>
    Math.abs((v.min.x + v.max.x) / 2 - midD) < 1.5 * INCH &&
    (v.max.y - v.min.y) > (bd.y1 - bd.y0) * 0.7 && (v.max.x - v.min.x) < 6 * INCH);
  assert.ok(onCentreD.length > 0, 'the cedar double lost its centre mullion');
});

test('the single leaf is cedar, the same cedar as the double', () => {
  const leafColour = (parts) => {
    const f = leafFrames(parts);
    assert.ok(f.length, 'no leaf frame found to read a colour off');
    return parts.find(v => v.obj.material && !v.obj.material.map &&
      Math.abs((v.min.x + v.max.x) / 2 - f[0].stiles[0]) < 1e-6).obj.material.color.getHex();
  };
  assert.equal(leafColour(build('cedarSingle', 36, 76)), leafColour(build('cedar', 60, 76)),
    'the cedar single rendered a different leaf colour than the cedar double');
});

test('the single keeps the cedar transom, and it is see-through', () => {
  const parts = build('cedarSingle', 36, 76);
  const b = span(parts);
  const top = b.y1 - (b.y1 - b.y0) * 0.25;
  // Transparent or low-opacity material up in the transom band = glass, not a slab.
  const glass = parts.filter(v => v.min.y > top && v.obj.material &&
                                  (v.obj.material.transparent || v.obj.material.opacity < 1));
  assert.ok(glass.length > 0, 'no glass in the cedar single transom band');
});

test('doorCatFor round-trips both cedar entries to their own tile', () => {
  const catIndex = (cat) => c.DOOR_SIZES.findIndex(x => x.cat === cat);
  assert.ok(catIndex('cedarSingle') >= 0, 'no Cedar Single entry in DOOR_SIZES');
  assert.equal(c.doorCatFor({ style: 'cedarSingle', w: 36 }), catIndex('cedarSingle'));
  assert.equal(c.doorCatFor({ style: 'cedarSingle', w: 42 }), catIndex('cedarSingle'));
  assert.equal(c.doorCatFor({ style: 'cedar', w: 60 }), catIndex('cedar'));
  assert.equal(c.doorCatFor({ style: 'cedar', w: 96 }), catIndex('cedar'));

  // The two entries share kind:'cedar', so a width-blind kind test would send
  // both to whichever sits first in the array. Guard that they differ.
  assert.notEqual(catIndex('cedarSingle'), catIndex('cedar'));
});

test('the Cedar Single sits in Custom Doors with two widths', () => {
  const e = c.DOOR_SIZES.find(x => x.cat === 'cedarSingle');
  assert.equal(e.section, 'custom');
  assert.equal(e.kind, 'cedar');
  assert.equal(e.styles.map(s => s[3]).join(','), '36,42');
  assert.ok(e.styles.every(s => s[0] === 'cedarSingle'), 'every Cedar Single tile must carry the cedarSingle style id');
  // Same head height as the 5'/6' doubles, so the two line up on one wall.
  const dblH = c.DOOR_SIZES.find(x => x.cat === 'cedar').styles[0][2];
  assert.ok(e.styles.every(s => s[2] === dblH), `Cedar Single head height should match the double's ${dblH}`);
});

test('the Cedar Single icon has no centre mullion and the double still does', () => {
  const singleIcon = c.doorStyleIcon('cedarSingle', 'cedar');
  const dblIcon = c.doorStyleIcon('cedar', 'cedar');
  // A vertical line spanning most of the 48-unit icon, at its horizontal centre.
  const hasMullion = (svg) => /<line x1="2[34](\.\d+)?" y1="\d+" x2="2[34](\.\d+)?" y2="4\d"/.test(svg);
  assert.ok(hasMullion(dblIcon), 'the cedar DOUBLE icon lost its centre mullion');
  assert.ok(!hasMullion(singleIcon), 'the cedar SINGLE icon is drawing a centre mullion');
  // Both are cedar-coloured, so the pair reads as one product family.
  assert.ok(singleIcon.includes('#b07a3c'), 'the cedar single icon is not drawn in cedar');
});
