# Visual capture — real WebGL screenshots

The geometry tests measure the model. These take **pictures of it**, in a real
browser with real WebGL, which is the only way to judge lighting, colour,
materials and tone mapping. Nothing else here can see those.

It matters because the alternative is guessing. The colour-management bug —
r152 API on an r128 build, every assignment a silent no-op — was invisible to
every other check in this repo, and the "improved" lighting values that came
back from a review were only worth anything once they could be measured against
a capture.

## Running it

```sh
# once: a local copy of three.js, same version the page loads
curl -sSo tests/three.js https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js

# build a capture copy of the page and serve it
python3 tests/visual/mkpage.py            # writes /tmp/claude-0/shot/designer.html
cd /tmp/claude-0/shot && python3 -m http.server 8731 &

# take a shot
tests/visual/cap.sh out.png '{"style":"gable","set":{"W":12,"L":16,"H":8,
  "SIDING":"vertical","sc":15789292,"tc":15789292,"rc":2631722},
  "theta":1.95,"phi":1.10,"radius":8.5}'
```

`mkpage.py` copies `designer.html`, repoints the Three.js CDN tag at the local
file, and appends a capture harness that reads `?cap=<json>`, applies a build,
hides every UI element and pins the camera. **That harness only ever touches the
copy** — `designer.html` itself is never modified.

`cap.sh` drives headless Chromium with SwiftShader (`--use-angle=swiftshader`,
`--enable-unsafe-swiftshader`), since there is no GPU here.

## Reading the pictures

`analyse.py` samples regions and reports mean luminance, so a change can be
argued with a number instead of an adjective:

```sh
python3 tests/visual/analyse.py --turned before_turned phase1_turned
```

**Sample regions are per camera angle.** `SETS` holds one box list per angle.
Reusing the `default` boxes on a `turned` shot puts both wall samples on the
*same* wall and reports a contrast near zero for every build — which is exactly
the wrong answer, and a convincing one. If you add an angle, add its boxes.

The useful metric so far is **contrast**: mean luminance of the sunlit wall
minus the shaded one. On a white shed at the turned angle it went 6.7 → 25.4
when the lighting rig was corrected. Judge form by that, not by whether the
image "looks brighter" — brighter and flatter is easy to do by accident.

## A caution about camera angle

The default camera sits at azimuth ~49° and the sun at ~33°. They are nearly in
line, so at the default angle **both visible walls are lit** and no lighting
change can produce much shape. If you are testing form, use an angle where one
wall genuinely faces away from the sun (`theta: 1.95` does). This is worth
fixing in the product too — a hero angle that lights both faces equally is
throwing away the form the rig is there to create.
