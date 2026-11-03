/* STYLE SWITCHING (Nando t1476u). Lean-To -> Poolhouse left an exposed tan
 * roof section (interior OSB deck standing above the hip's end faces) and
 * gable vents floating over / through the hip roof.
 *   node --test tests/geometry/styleswitch.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDesigner } from '../harness.mjs';

const { c } = loadDesigner();
const T = c.THREE;
c.scene = new T.Scene(); c.shedGroup = new T.Group(); c.scene.add(c.shedGroup);
c.showToast = () => {};
function base(cfg){
  Object.assign(c, { W:10, L:10, H:8, PITCH:6, OVTYPE:'all4', OVH:4, PORCH_H:0, ROOFTYPE:'metal',
    INSIDE_VIEW:false, WALLS_XRAY:false, PORCH_LOC:'none', SIDE_PORCH:0, DORMER_L:0, DORMER_R:0 }, cfg);
}
function sw(style){ c.STYLE=style; c.reconcileStyleOpenings(true); c.__stubLights(); c.shedGroup.clear(); c.buildShed(); c.shedGroup.updateMatrixWorld(true); }
function topMat(x,z){
  const o=[]; c.shedGroup.traverse(m=>{ if(m.isMesh && !m.isInstancedMesh) o.push(m); });
  const h=new T.Raycaster(new T.Vector3(x,50,z), new T.Vector3(0,-1,0), 0, 100).intersectObjects(o,false);
  return h[0];
}

for (const [w,l] of [[10,10],[12,8],[8,12]]) {
  test(`hip ${w}x${l}: nothing wood-textured sits on top of the roof`, () => {
    base({W:w, L:l, ADDONS:Object.assign({}, c.ADDONS, {cupola:'none', ridgeVent:false})});
    sw('leanto'); sw('hip');
    for (const [x,z] of [[0,0.8],[0,-0.8],[0.3,0.6],[0.8,0],[-0.8,0.1]]) {
      const hit=topMat(x*w*0.1,z*l*0.1);
      assert.ok(hit, 'roof hit');
      assert.ok(!hit.object.material.map || hit.object.material.color.getHex()!==0xffffff || !hit.object.material.map.image ||
        hit.object.material.map.image.width!==512, `OSB deck exposed above the roof at ${x},${z}`);
    }
  });
}

test('vents park on Lean-To / Poolhouse and come back re-centred on gable styles', () => {
  base({W:8, L:12});
  c.ventsData=[{wall:'front',pos:0.5,cy:null},{wall:'back',pos:0.3,cy:50}]; c.VENTS_PARKED=[];
  sw('gable'); const fresh=c.ventsData.map(v=>v.cy);
  sw('leanto'); assert.equal(c.ventsData.length,0); assert.equal(c.VENTS_PARKED.length,2); assert.equal(c.ventMeshes.length,0);
  sw('hip');    assert.equal(c.ventsData.length,0); assert.equal(c.ventMeshes.length,0);
  sw('gable');  assert.equal(c.ventsData.length,2); assert.equal(c.ventMeshes.length,2);
  assert.equal(c.ventsData[0].cy, fresh[0]);
  const wallTop=8*12;
  for (const v of c.ventsData) assert.ok(v.cy>wallTop, 'vent in the gable triangle');
  for (const st of ['barn','3peak','4peak']) { sw(st); assert.equal(c.ventMeshes.length,2, st); }
});

test('cupola / ridge vent parked off the quote on roofs that cannot carry them, restored after', () => {
  base({W:8, L:12}); c.ventsData=[]; c.VENTS_PARKED=[];
  c.ADDONS=Object.assign({}, c.ADDONS, {cupola:'black', ridgeVent:true}); c.ADDONS_PARKED={};
  sw('gable'); sw('leanto');
  assert.equal(c.ADDONS.cupola,'none'); assert.equal(c.ADDONS.ridgeVent,false);
  sw('3peak'); assert.equal(c.ADDONS.cupola,'none'); assert.equal(c.ADDONS.ridgeVent,true);
  sw('barn');  assert.equal(c.ADDONS.cupola,'black');
});
