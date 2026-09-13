"""Convert a string to a single SVG path using the real Barlow Condensed outlines.

A logo that ships <text font-family="Barlow Condensed"> renders in Arial on any
machine without the font — which is most of them, including his phone and Canva.
Outlines make the file self-contained.
"""
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

class Text2Path:
    def __init__(self, ttf):
        self.f = TTFont(ttf)
        self.upm = self.f['head'].unitsPerEm
        self.gs = self.f.getGlyphSet()
        self.cmap = self.f.getBestCmap()
        self.hmtx = self.f['hmtx']

    def path(self, text, size, tracking=0.0, x=0.0, y=0.0):
        """tracking is in em units (0.04 = 40/1000). y is the BASELINE."""
        scale = size / self.upm
        pen_out = SVGPathPen(self.gs, ntos=lambda v: f"{v:.2f}")
        cursor = 0.0
        for ch in text:
            gname = self.cmap.get(ord(ch))
            if gname is None:
                cursor += self.upm * 0.3
                continue
            # flip Y (font units go up, SVG goes down) and place at x/y
            t = Transform(scale, 0, 0, -scale, x + cursor * scale, y)
            tp = TransformPen(pen_out, t)
            self.gs[gname].draw(tp)
            cursor += self.hmtx[gname][0] + tracking * self.upm
        return pen_out.getCommands(), cursor * scale

    def width(self, text, size, tracking=0.0):
        c = 0.0
        for ch in text:
            g = self.cmap.get(ord(ch))
            if g is None:
                c += self.upm * 0.3
                continue
            c += self.hmtx[g][0] + tracking * self.upm
        # trailing tracking isn't ink
        if text:
            c -= tracking * self.upm
        return c * (size / self.upm)

    def cap_height(self, size):
        try:
            return self.f['OS/2'].sCapHeight * size / self.upm
        except Exception:
            return 0.72 * size
