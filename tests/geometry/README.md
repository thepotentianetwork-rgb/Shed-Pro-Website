# Geometry tests

`designer.html` builds the shed in Three.js, and until now nothing checked the
result — a hole in the roof was only found by someone looking at it.

These tests run the page's real script in node with the real Three.js and then
**fire rays at the model**. No WebGL is involved and none is needed: meshes,
transforms and raycasts are pure maths. A test asks questions like "standing
under the porch, can I see the sky" rather than re-reading the numbers that
placed the meshes, so it fails on the thing a customer would notice.

## Running them

Three.js is not vendored in git-friendly form by these tests; fetch it once:

```sh
curl -sSo tests/geometry/three.js \
  https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js
node --test tests/geometry/porch.test.mjs
```

Use the same version the page loads (`0.128.0`), or the tests are measuring a
different library than production.

## What is here

- `harness.mjs` — loads `designer.html` in a VM with a stubbed DOM, canvas and
  renderer, and exposes the scene. `meshes()` returns every mesh with its true
  world-space bounds.
- `render.mjs` — a small software raycast renderer that writes a PNG. Not for
  pixel comparison: for **looking** at the geometry when a number is not enough.
  Shading is a single lambert term off the material colour, so textures and
  lighting do not appear.
- `porch.test.mjs` — the porch roof closes over the porch at every overhang,
  overhang type, pitch and depth, and the ceiling tucks under the roof rather
  than through it.

## Adding a test

`loadDesigner()` gives you the page's globals. Set the ones you care about
(`STYLE`, `W`, `L`, `H`, `PITCH`, `OVTYPE`, `OVH`, `PORCH_LOC`, …), call
`__stubLights()`, then `buildShed()`. Lights live in `init()`, which needs a
real renderer, so the harness supplies stand-ins.
