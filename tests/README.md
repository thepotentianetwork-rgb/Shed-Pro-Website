# Designer tests

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
curl -sSo tests/three.js \
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
- `geometry/porch.test.mjs` — the porch roof closes over the porch at every
  overhang, overhang type, pitch and depth, and the ceiling tucks under the
  roof rather than through it.
- `geometry/openings.test.mjs` — no daylight around the arched door, battens
  keep off door and vent trim, and a gable vent sits dead centre.
- `ui/snapping.test.mjs` — where a dragged window actually lands: the wall's
  centre, a mirror, an even-spacing slot, another window's sill.
- `ui/badges.test.mjs` — a style tile's badge takes the description's line, and
  the description comes back when the badge goes.

## Adding a test

`loadDesigner()` gives you the page's globals. Set the ones you care about
(`STYLE`, `W`, `L`, `H`, `PITCH`, `OVTYPE`, `OVH`, `PORCH_LOC`, …), call
`__stubLights()`, then `buildShed()`. Lights live in `init()`, which needs a
real renderer, so the harness supplies stand-ins.

## Two things that will bite you

**Cross-realm values.** The page runs inside a VM context, so its arrays and
objects carry that realm's prototypes. `assert.deepStrictEqual` compares
prototypes, so a correct array fails against a plain one — wrap it in
`Array.from()` (or compare fields) first.

**State between tests.** The page's globals are module state, not per-build.
A selected item grows a highlight mesh, `addVent()` selects what it adds, and
the next test then measures the highlight as if it were trim. Reset selection
and `EDIT_MODE` in your build helper, not just the data arrays.
