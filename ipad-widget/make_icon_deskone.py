"""Desk One icon: the gold cup-with-handle (see make_icon.py) lowered in a gold
frame, with "Desk One" spelled out in gold below it. Approved design 2026-11-06.

Draws a 1024x1024 master (all layout numbers below are 512-space x2) and
downsamples to the sizes the app references:
  icon-cup.png         180x180  (apple-touch-icon / manifest, same name as before)
  icon-deskone-512.png 512x512  (master copy kept next to it)

Run: python3 make_icon_deskone.py
"""
import glob
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
M = 1024               # master size
U = M // 512           # unit: 512-space -> master


def font_path():
    p = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
    if Path(p).exists():
        return p
    hits = sorted(glob.glob("/usr/share/fonts/**/NotoSansCJK-Bold*", recursive=True))
    if not hits:
        raise FileNotFoundError("NotoSansCJK-Bold not found")
    return hits[0]


def draw_cup(tile):
    """The cup-with-handle layer from make_icon.py, drawn at 4x and downsampled
    to `tile` px. Returns an RGB image including its own dark ground and glow
    (the ground is removed later by the luminance mask)."""
    S = tile * 4
    K = S / 180.0
    im = Image.new("RGB", (S, S), (8, 9, 13))
    glow = Image.new("RGB", (S, S), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse((S * 0.10, S * 0.32, S * 0.90, S * 1.08), fill=(130, 88, 34))
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(28 * K)), 0.55)
    d = ImageDraw.Draw(im)
    RIM, BOT = 0.36, 0.72          # rim (resistance) and cup bottom, fractions of height
    CL, CR = 0.14, 0.62            # cup from left rim to right rim

    def y(x):                      # the price path
        if x <= CR:
            a = math.pi * (x - CL) / (CR - CL)
            return RIM + (BOT - RIM) * math.sin(a)
        if x <= 0.74:              # handle: shallow pullback
            return RIM + 0.09 * math.sin(math.pi * (x - CR) / 0.16)
        return RIM - (x - 0.78) * 1.9

    X0, X1 = CL, 0.86
    path = [(X0 + (X1 - X0) * i / 300) for i in range(301)]
    line = [(x * S, y(x) * S) for x in path]
    # candles: close on the path, open at the previous close
    n = 14
    xs = [CL + 0.02 + i * (0.84 - CL - 0.02) / (n - 1) for i in range(n)]
    prev = y(xs[0] - 0.04)
    for x in xs:
        c = y(x)
        o = prev
        col = (240, 202, 128) if c <= o else (165, 128, 70)
        wick = 0.028
        X = x * S
        w = 8.5 * K
        d.line((X, (min(o, c) - wick) * S, X, (max(o, c) + wick) * S), fill=col, width=int(2 * K))
        t, b = min(o, c) * S, max(o, c) * S
        if b - t < 4 * K:
            t -= 2 * K
            b = t + 4 * K
        d.rounded_rectangle((X - w / 2, t, X + w / 2, b), radius=2 * K, fill=col)
        prev = c
    # resistance at the rim
    d.line((0.10 * S, RIM * S, 0.80 * S, RIM * S), fill=(227, 184, 103), width=int(1.4 * K))
    # path line, slightly above the candles for clarity
    d.line(line, fill=(255, 226, 164), width=int(3.6 * K), joint="curve")
    ex, ey = line[-1]
    px, py = line[-12]
    ang = math.atan2(ey - py, ex - px)
    for s in (-1, 1):
        d.line((ex, ey, ex - 20 * K * math.cos(ang + s * 0.5), ey - 20 * K * math.sin(ang + s * 0.5)),
               fill=(255, 226, 164), width=int(3.6 * K))
    return im.resize((tile, tile), Image.LANCZOS)


def background():
    """Near-black with a soft warm radial glow (no artwork in it)."""
    b = Image.new("RGB", (M, M), (7, 7, 10))
    gl = Image.new("RGB", (M, M), (0, 0, 0))
    ImageDraw.Draw(gl).ellipse([M * 0.02, M * 0.08, M * 0.98, M * 0.88], fill=(122, 82, 30))
    return Image.blend(b, gl.filter(ImageFilter.GaussianBlur(90 * U)), 0.5).convert("RGBA")


def paste_cup(canvas, cup_img, xy):
    """Composite by luminance: dark pixels are transparent, so only the gold
    art (and a whisper of its glow) sits on the background."""
    lum = cup_img.convert("L").point(lambda v: max(0, v - 12) * 255 // 90 if v > 12 else 0)
    canvas.paste(cup_img, xy, lum)


def gold_text(text, font, top):
    """The text filled with a vertical gold gradient over the full height."""
    t = Image.new("RGBA", (M, M), (0, 0, 0, 0))
    td = ImageDraw.Draw(t)
    w = td.textlength(text, font=font)
    td.text(((M - w) / 2, top), text, font=font, fill=(255, 255, 255, 255))
    grad = Image.new("RGB", (1, M))
    top_c, bot_c = (255, 228, 152), (172, 120, 40)
    for yy in range(M):
        f = yy / M
        grad.putpixel((0, yy), tuple(int(top_c[i] + (bot_c[i] - top_c[i]) * f) for i in range(3)))
    g = grad.resize((M, M)).convert("RGBA")
    g.putalpha(t.split()[3])
    return g


def main():
    img = background()
    # cup-with-handle, lowered: a 264x264 tile at (124, 54) in 512-space
    paste_cup(img, draw_cup(264 * U), (124 * U, 54 * U))
    # "Desk One" in gold, centered, top at y=306 (512-space)
    font = ImageFont.truetype(font_path(), 92 * U)
    img.alpha_composite(gold_text("Desk One", font, 306 * U))
    d = ImageDraw.Draw(img, "RGBA")
    gold = (227, 184, 103)
    # rules above and below the wordmark, clear of the glyphs
    d.line([96 * U, 282 * U, 416 * U, 282 * U], fill=gold + (200,), width=3 * U)
    d.line([96 * U, 424 * U, 416 * U, 424 * U], fill=gold + (200,), width=3 * U)
    # diamond accent below the lower rule, centered (256, 448)
    cx, cy, r = 256 * U, 448 * U, 7 * U
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=gold + (230,))
    # gold frame
    d.rounded_rectangle([24 * U, 24 * U, M - 24 * U, M - 24 * U], radius=78 * U,
                        outline=gold + (255,), width=5 * U)

    img.convert("RGB").resize((512, 512), Image.LANCZOS).save(HERE / "icon-deskone-512.png")
    img.convert("RGB").resize((180, 180), Image.LANCZOS).save(HERE / "icon-cup.png")
    print("wrote icon-deskone-512.png (512x512) and icon-cup.png (180x180)")


if __name__ == "__main__":
    main()
