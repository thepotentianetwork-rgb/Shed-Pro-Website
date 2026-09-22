# The Craftsman door

![the reference](img/craftsman-door-reference.jpg)

This is the door the Craftsman style in `designer.html` is built to match. It
is here because the first version was built from the *idea* of a Craftsman
door rather than from this photo, and the difference is not obvious from the
code — someone reading `addOverlays` a year from now would have no way to know
why the obvious textbook detail is deliberately absent.

## What the reference has, top to bottom

| | |
|---|---|
| **Head cap** | A thin shelf **above** the glass, the full width of the leaf, standing proud of the face. |
| **Four lites** | A band about 9.5in deep, divided by three muntins. Four panes, not three. |
| **A plain rail** | Under the glass. Nothing hangs off it. |
| **Two tall panels** | Split by a centre stile, running most of the leaf. |
| **A deep bottom rail** | Noticeably deeper than the rails above it. |
| **Entry hardware** | Three small butt hinges tight to the jamb, and a round knob. |

## What the first version had, and why it was wrong

A textbook Craftsman entry door has **three** lites over a **dentil shelf** —
a shelf that projects from the face with a row of small square blocks beneath
it. That is a real and correct description of the style, it is what the code
was written to, and it is not this door.

The shelf was also on the wrong side of the glass. In the reference the
projecting piece is *over* the lites; the dentil shelf sits *under* them. So
the one part that stood off the face stood off it in the wrong place.

The other half of it was hardware. The Craftsman was in the shed-door family,
so it was getting the decorative T-strap hinge — about nine inches of iron
reaching a third of the way across the leaf and over the panels — and a
T-handle, which is what goes on a barn. Next to the reference, with its three
small butt hinges and a round knob, that was the loudest thing wrong with it.
Only the hardware moved; the frame, jamb and panel materials are still the
shed door's, because that is what the door is built out of.

## Where it lives

- `glassRegion()` — the 9.5in band and the 5.5in of rail above it, sized in
  inches so the band does not grow into half the door on an 84in leaf.
- `addOverlays()`, the `DOOR==='craftsman'` branch — the cap, the muntins, the
  rail and the panels.
- the hardware branch — `isCraftHW` puts it with the residential doors.
- `tests/geometry/craftsmandoor.test.mjs` — each row of the table above, as a
  check against the geometry rather than against the numbers that placed it.
