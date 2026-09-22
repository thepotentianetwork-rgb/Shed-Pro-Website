// Load designer.html's script for real, with THREE present and a stubbed canvas,
// so buildShed() produces actual meshes we can measure.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* Runs designer.html's real script in node, with the real three.js, so the
   geometry can be measured instead of eyeballed. There is no WebGL here and
   none is needed: meshes, positions and raycasts are all pure maths.

   three.js is not vendored — fetch it once before running:
     curl -sSo tests/geometry/three.js \
       https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
   Same version the page loads. */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const THREE_SRC = readFileSync(join(HERE, 'three.js'), 'utf8');
const HTML = readFileSync(join(REPO, 'designer.html'), 'utf8');

function ctx2d() {
  const noop = () => {};
  return new Proxy({
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    putImageData: noop, createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    measureText: () => ({ width: 10 }),
  }, { get: (t, k) => (k in t ? t[k] : noop) });
}
function makeCanvas() {
  const c = { width: 256, height: 256, style: {}, getContext: () => ctx2d(), toDataURL: () => 'data:,', addEventListener() {}, remove() {} };
  return c;
}

export function loadDesigner() {
  const el = () => ({
    innerHTML: '', textContent: '', value: '', checked: false, className: '', id: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [], childNodes: [], dataset: {},
    appendChild(c) { this.children.push(c); return c; }, removeChild() {}, insertBefore() {},
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    getContext: () => ctx2d(), toDataURL: () => 'data:,', closest: () => null, contains: () => false,
  });
  const doc = {
    createElement: (t) => (t === 'canvas' ? makeCanvas() : el()),
    createElementNS: () => el(), createTextNode: () => el(),
    getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: el(), head: el(), documentElement: el(), title: '', readyState: 'complete',
    getElementsByTagName: () => [],
  };
  const c = {
    console, Math, JSON, Date, Object, Array, String, Number, Boolean, Error, RegExp, Map, Set, Promise,
    Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
    parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent, URLSearchParams,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    fetch: () => new Promise(() => {}),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { search: '', hash: '', href: 'https://x/designer.html', pathname: '/designer.html', origin: 'https://x' },
    history: { replaceState() {}, pushState() {} },
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    screen: { width: 1400, height: 900 }, devicePixelRatio: 1,
    innerWidth: 1400, innerHeight: 900, document: doc,
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    performance: { now: () => 0 },
  };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(THREE_SRC, c, { filename: 'three.js' });
  // No WebGL in node: the renderer is never needed to measure geometry.
  c.THREE.WebGLRenderer = function () {
    return { domElement: makeCanvas(), setSize() {}, setPixelRatio() {}, render() {},
             setClearColor() {}, shadowMap: {}, outputEncoding: 0, toneMapping: 0, info: {} };
  };
  // A renderer stub: buildShed ends by asking for a redraw, and only the
  // geometry matters here.
  c.renderer = { domElement: makeCanvas(), setSize() {}, setPixelRatio() {}, render() {},
                 setClearColor() {}, shadowMap: {}, outputColorSpace: 0, toneMapping: 0,
                 toneMappingExposure: 1, info: {}, getContext: () => null };
  c.__stubLights = () => {
    const L = (extra) => Object.assign({
      intensity: 1, color: { setHex() {}, set() {} }, groundColor: { setHex() {} },
      position: { set() {}, copy() {} }, target: { position: { set() {} } },
      shadow: { mapSize: { set() {} }, camera: {}, bias: 0, normalBias: 0, radius: 0 },
      castShadow: false, visible: true,
    }, extra || {});
    for (const n of ['ambLight','hemiLight','sunLight','fillLight','rimLight']) c[n] = L();
  };
  const scripts = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const warns = [];
  for (const s of scripts) {
    try { vm.runInContext(s, c, { filename: 'designer.html' }); }
    catch (e) { warns.push(e.message); }
  }
  return { c, warns };
}

// Every mesh in the scene, with its true world-space axis-aligned bounds.
export function meshes(c) {
  const out = [];
  if (!c.shedGroup) return out;
  c.shedGroup.updateMatrixWorld(true);
  c.shedGroup.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    out.push({ obj: o, min: b.min.clone(), max: b.max.clone(),
               p: o.geometry.parameters || {}, type: o.geometry.type });
  });
  return out;
}
