// Software raycast renderer: no WebGL, but enough to SEE the geometry.
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

export function png(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const crcT = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]));
}

export function renderScene(T, objs, { W = 320, H = 240, eye, look, fov = 45, bg = [150, 190, 230] }) {
  const buf = Buffer.alloc(W * H * 3);
  const e = new T.Vector3().fromArray(eye), c = new T.Vector3().fromArray(look);
  const fwd = c.clone().sub(e).normalize();
  const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize();
  const up = new T.Vector3().crossVectors(right, fwd).normalize();
  const th = Math.tan((fov * Math.PI) / 360);
  const rc = new T.Raycaster(); rc.far = 200;
  const sun = new T.Vector3(0.4, 0.8, 0.45).normalize();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = ((x + 0.5) / W * 2 - 1) * th * (W / H);
      const sy = (1 - (y + 0.5) / H * 2) * th;
      const dir = fwd.clone().addScaledVector(right, sx).addScaledVector(up, sy).normalize();
      rc.set(e, dir);
      const hit = rc.intersectObjects(objs, false)[0];
      let col;
      if (!hit) col = bg;
      else {
        const m = hit.object.material;
        const mc = (m && m.color) ? m.color : { r: 0.6, g: 0.6, b: 0.6 };
        let n = hit.face ? hit.face.normal.clone() : new T.Vector3(0, 1, 0);
        n.transformDirection(hit.object.matrixWorld);
        const lam = 0.35 + 0.65 * Math.max(0, n.dot(sun));
        col = [mc.r * 255 * lam, mc.g * 255 * lam, mc.b * 255 * lam];
      }
      const i = (y * W + x) * 3;
      buf[i] = Math.min(255, Math.max(0, col[0] | 0));
      buf[i + 1] = Math.min(255, Math.max(0, col[1] | 0));
      buf[i + 2] = Math.min(255, Math.max(0, col[2] | 0));
    }
  }
  return buf;
}
