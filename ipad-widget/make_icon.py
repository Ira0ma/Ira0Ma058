"""Cup-with-handle icon for Trade Desk (180x180 apple-touch-icon), drawn at 4x and downsampled."""
import math, sys
from PIL import Image, ImageDraw, ImageFilter
K = 4; S = 180 * K
im = Image.new("RGB", (S, S), (8, 9, 13))
glow = Image.new("RGB", (S, S), (0, 0, 0)); g = ImageDraw.Draw(glow)
g.ellipse((S*0.10, S*0.32, S*0.90, S*1.08), fill=(130, 88, 34))
im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(28*K)), 0.55)
d = ImageDraw.Draw(im)
RIM, BOT = 0.36, 0.72          # rim (resistance) and cup bottom, as fractions of the height
CL, CR = 0.14, 0.62            # cup from left rim to right rim
def y(x):                      # the price path
    if x <= CR:
        a = math.pi * (x - CL) / (CR - CL)
        return RIM + (BOT - RIM) * math.sin(a)
    if x <= 0.70:              # handle: shallow pullback
        return RIM + 0.09 * math.sin(math.pi * (x - CR) / 0.16)
    if x <= 0.74:
        return RIM + 0.09 * math.sin(math.pi * (x - CR) / 0.16)
    return RIM - (x - 0.78) * 1.9 if x > 0.78 else RIM + 0.09 * math.sin(math.pi * (x - CR) / 0.16)
X0, X1 = CL, 0.86
path = [(X0 + (X1 - X0) * i / 300) for i in range(301)]
line = [(x * S, y(x) * S) for x in path]
# candles: close on the path, open at the previous close
n = 14; xs = [CL + 0.02 + i * (0.84 - CL - 0.02) / (n - 1) for i in range(n)]
prev = y(xs[0] - 0.04)
for x in xs:
    c = y(x); o = prev; up = c <= o
    col = (240, 202, 128) if up else (165, 128, 70)
    wick = 0.028
    X = x * S; w = 8.5 * K
    d.line((X, (min(o, c) - wick) * S, X, (max(o, c) + wick) * S), fill=col, width=int(2 * K))
    t, b = min(o, c) * S, max(o, c) * S
    if b - t < 4 * K: t -= 2 * K; b = t + 4 * K
    d.rounded_rectangle((X - w / 2, t, X + w / 2, b), radius=2 * K, fill=col)
    prev = c
# resistance at the rim
d.line((0.10*S, RIM*S, 0.80*S, RIM*S), fill=(227, 184, 103), width=int(1.4*K))
# path line, slightly above the candles for clarity
d.line(line, fill=(255, 226, 164), width=int(3.6 * K), joint="curve")
ex, ey = line[-1]; px, py = line[-12]; ang = math.atan2(ey - py, ex - px)
for s in (-1, 1):
    d.line((ex, ey, ex - 20*K*math.cos(ang + s*0.5), ey - 20*K*math.sin(ang + s*0.5)), fill=(255, 226, 164), width=int(3.6*K))
im.resize((180, 180), Image.LANCZOS).save(sys.argv[1])
