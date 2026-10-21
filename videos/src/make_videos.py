"""台本データから縦型ショート動画（1080x1920, 30fps, ナレーション付き）を作る。

使い方: python3 make_videos.py [動画ID ...]   （省略時は10本すべて）
必要なもの: ffmpeg, Pillow, numpy, pyopenjtalk-plus
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import pyopenjtalk
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from scripts import VIDEOS

W, H, FPS = 1080, 1920, 30
SR = 48000
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
OUT = Path(__file__).resolve().parent.parent
TMP = OUT / "src" / "_tmp"
SPEED = 1.15
GAP = 0.25  # シーン間の無音（秒）
INTRO_FRAMES = 6  # テロップが出てくるアニメーションの長さ

# TikTok/リールの右側ボタンと下のキャプション欄にかぶらない範囲
TEXT_MAX_W = 900
CENTER_Y = 820


def font(size):
    return ImageFont.truetype(FONT, size)


def fit_font(text, max_w, start, min_size=48):
    size = start
    while size > min_size:
        f = font(size)
        widest = max(f.getlength(line) for line in text.split("\n"))
        if widest <= max_w:
            return f
        size -= 4
    return font(min_size)


def draw_text_block(draw, text, f, cx, top, fill, stroke, stroke_w, spacing=1.18):
    lines = text.split("\n")
    lh = int(f.size * spacing)
    for i, line in enumerate(lines):
        w = f.getlength(line)
        draw.text((cx - w / 2, top + i * lh), line, font=f, fill=fill,
                  stroke_width=stroke_w, stroke_fill=stroke)
    return len(lines) * lh


def text_height(text, f, spacing=1.18):
    return len(text.split("\n")) * int(f.size * spacing)


def make_background(c1, c2):
    y = np.linspace(0, 1, H)[:, None, None]
    x = np.linspace(0, 1, W)[None, :, None]
    t = np.clip(0.75 * y + 0.25 * x, 0, 1)
    img = (np.array(c1) * (1 - t) + np.array(c2) * t)
    # 周辺を少し暗くして中央のテロップを目立たせる
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.43) / (H * 0.7)) ** 2)
    img = img * np.clip(1.15 - 0.45 * d, 0.55, 1.1)[:, :, None]
    bg = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")
    # 薄い斜線模様
    pat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pat)
    for k in range(-H, W, 90):
        pd.line([(k, 0), (k + H, H)], fill=(255, 255, 255, 10), width=28)
    bg.paste(pat, (0, 0), pat)
    return bg


def static_overlay(v):
    """どのシーンでも出す要素（PR表記・ジャンル・注意書き）。"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([48, 96, 168, 160], radius=14, fill=(255, 255, 255, 235))
    d.text((70, 104), "PR", font=font(46), fill=(20, 20, 20))
    lf = font(40)
    lw = lf.getlength(v["label"])
    d.rounded_rectangle([188, 96, 188 + lw + 48, 160], radius=32, fill=(0, 0, 0, 110))
    d.text((212, 106), v["label"], font=lf, fill=(255, 255, 255))
    if v.get("disclaimer"):
        df = fit_font(v["disclaimer"], 860, 30, 22)
        dw = df.getlength(v["disclaimer"])
        d.text(((W - dw) / 2, 1500), v["disclaimer"], font=df, fill=(255, 255, 255, 200),
               stroke_width=2, stroke_fill=(0, 0, 0, 160))
    return layer


def scene_layer(sc, v):
    """シーンごとのテロップ（アニメーションさせる部分）。"""
    accent = v["accent"]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    kind = sc["kind"]

    start = {"hook": 124, "card": 104, "step": 112, "cta": 104}[kind]
    tf = fit_font(sc["t"], TEXT_MAX_W, start)
    sf = fit_font(sc["s"], 860, 58) if sc.get("s") else None

    blocks = text_height(sc["t"], tf)
    if sf:
        blocks += 60 + text_height(sc["s"], sf, 1.3) + 40
    if kind == "step":
        blocks += 250
    top = CENTER_Y - blocks // 2

    if kind == "step":
        # STEP番号と3つの丸（どこまで進んだか）
        r = 70
        cx = W // 2
        d.ellipse([cx - r, top, cx + r, top + 2 * r], fill=accent)
        nf = font(96)
        nw = nf.getlength(str(sc["no"]))
        d.text((cx - nw / 2, top + r - 58), str(sc["no"]), font=nf, fill=(20, 20, 20))
        for i in range(3):
            x = cx - 60 + i * 60
            fill = accent if i < sc["no"] else (255, 255, 255, 90)
            d.ellipse([x - 12, top + 2 * r + 30, x + 12, top + 2 * r + 54], fill=fill)
        top += 250

    if kind == "hook":
        # 冒頭は黄色い帯の上に黒文字で一番強く見せる
        th = text_height(sc["t"], tf)
        d.rounded_rectangle([60, top - 40, W - 60, top + th + 30], radius=36, fill=accent + (245,))
        draw_text_block(d, sc["t"], tf, W // 2, top, (15, 15, 15), (255, 255, 255), 0)
        top += th
    else:
        top += draw_text_block(d, sc["t"], tf, W // 2, top, (255, 255, 255), (10, 10, 10), 10)

    if sf:
        top += 60
        sh = text_height(sc["s"], sf, 1.3)
        sw = max(sf.getlength(l) for l in sc["s"].split("\n"))
        d.rounded_rectangle([W / 2 - sw / 2 - 36, top - 22, W / 2 + sw / 2 + 36, top + sh + 6],
                            radius=24, fill=(0, 0, 0, 150))
        draw_text_block(d, sc["s"], sf, W // 2, top, accent, (0, 0, 0), 0, 1.3)
        top += sh + 40

    if kind == "cta":
        # プロフィールへの誘導（左上のアイコン方向を指す）
        af = font(52)
        msg = "▲ プロフィールのリンクへ"
        aw = af.getlength(msg)
        y = top + 40
        d.rounded_rectangle([W / 2 - aw / 2 - 40, y, W / 2 + aw / 2 + 40, y + 96], radius=48,
                            fill=(255, 255, 255, 240))
        d.text((W / 2 - aw / 2, y + 20), msg, font=af, fill=(20, 20, 20))
    return layer


def tts(text):
    x, sr = pyopenjtalk.tts(text, speed=SPEED)
    if sr != SR:
        idx = np.linspace(0, len(x) - 1, int(len(x) * SR / sr))
        x = np.interp(idx, np.arange(len(x)), x)
    return x.astype(np.float32)


def write_wav(path, x):
    peak = np.max(np.abs(x)) or 1.0
    x = (x / peak * 0.85 * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(x.tobytes())


def build(v):
    TMP.mkdir(parents=True, exist_ok=True)
    audio, frames_per_scene = [], []
    for sc in v["scenes"]:
        a = tts(sc["n"])
        pad = np.zeros(int(SR * GAP), np.float32)
        seg = np.concatenate([a, pad])
        n = int(round(len(seg) / SR * FPS))
        seg = np.concatenate([seg, np.zeros(max(0, int(n * SR / FPS) - len(seg)), np.float32)])
        audio.append(seg[: int(n * SR / FPS)])
        frames_per_scene.append(n)
    wav = TMP / f"{v['id']}.wav"
    write_wav(wav, np.concatenate(audio))

    total = sum(frames_per_scene)
    bg = make_background(*v["colors"])
    over = static_overlay(v)
    base = bg.copy()
    base.paste(over, (0, 0), over)

    out = OUT / f"{v['id']}.mp4"
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", str(wav),
           "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    done = 0
    accent = v["accent"]
    for sc, n in zip(v["scenes"], frames_per_scene):
        layer = scene_layer(sc, v)
        for i in range(n):
            frame = base.copy()
            if i < INTRO_FRAMES:
                p = (i + 1) / INTRO_FRAMES
                ease = 1 - (1 - p) ** 3
                if sc["kind"] == "hook":
                    # 冒頭はポンと大きく出す
                    scale = 1.25 - 0.25 * ease
                    lw, lh = int(W * scale), int(H * scale)
                    big = layer.resize((lw, lh), Image.BILINEAR)
                    ox, oy = (W - lw) // 2, int(CENTER_Y - CENTER_Y * scale)
                    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    tmp.paste(big, (ox, oy))
                    lay = tmp
                else:
                    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                    lay.paste(layer, (0, int(60 * (1 - ease))))
                alpha = lay.getchannel("A").point(lambda a, e=ease: int(a * e))
                lay.putalpha(alpha)
                frame.paste(lay, (0, 0), lay)
            else:
                frame.paste(layer, (0, 0), layer)
            # 上部の進行バー（あとどれくらいで終わるかを見せて離脱を減らす）
            d = ImageDraw.Draw(frame)
            d.rectangle([0, 0, W, 14], fill=(0, 0, 0))
            d.rectangle([0, 0, int(W * (done + 1) / total), 14], fill=accent)
            proc.stdin.write(frame.tobytes())
            done += 1
    proc.stdin.close()
    proc.wait()
    if proc.returncode:
        raise SystemExit(f"ffmpeg failed: {v['id']}")
    print(f"{out.name}: {total / FPS:.1f}s")


if __name__ == "__main__":
    ids = set(sys.argv[1:])
    for v in VIDEOS:
        if not ids or v["id"] in ids:
            build(v)
