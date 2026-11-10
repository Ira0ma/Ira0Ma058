#!/usr/bin/env python3
"""Desk of Ayu: one-command build (旗艦ジョブ・あゆ版 src 再統一).

  python3 ayu-build/build_ayu.py           # rebuild ayu/index.html and ipad-widget/learn/ayu/ from ayu/
  python3 ayu-build/build_ayu.py --check   # build in memory, report files that would change, exit 1 if any

Sources (edit these, never the generated files):
  ayu/index.src.html     the home page fragment (all Desk of Ayu features live here)
  ayu/{gold,usdjpy,btc,oil,silver}.html, ayu/{tools,core,sw}.js, ayu/{lotsim,weekend}.html
  ayu-build/learn-manifest.webmanifest   the manifest served from learn/ayu/
Generated:
  ayu/index.html                         = Desk of Ayu head + the fragment (as generate.py did), sheets stamped ?v=<build id>
  ayu/<dashboard>.html                   only the <meta name="build"> line is rewritten (hash of the page without it)
  ipad-widget/learn/ayu/*                = ayu/* with the paths rewritten for /Ira0Ma058/learn/ayu/ (the served copy)
The one-time migration scripts generate.py, transform.py, grace.py and features.py are kept for the record; their
results are already part of ayu/index.src.html and are not run again. Storage keys and origins are untouched.
"""
import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
AYU = REPO / "ayu"
LEARN = REPO / "ipad-widget" / "learn" / "ayu"
DASH = ["gold", "usdjpy", "btc", "oil", "silver"]
COPY = ["tools.js", "core.js", "sw.js", "lotsim.html", "weekend.html"]
META = re.compile(r'<meta name="build" content="[^"]*">\n')

HEAD = """<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Desk of Ayu">
<meta name="theme-color" content="#06070b">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-ayu.png">
<link rel="icon" type="image/png" href="icon-ayu.png">
<meta name="build" content="{build}">
<title>Desk of Ayu</title>
<style>:root{--gutter:0px!important}</style>
"""


def stamp(text):
    """The page with its build meta set to the hash of the page without it (the same rule as ipad-widget/build.py)."""
    bare = META.sub("", text, count=1)
    bid = hashlib.sha1(bare.encode()).hexdigest()[:10]
    return META.sub('<meta name="build" content="%s">\n' % bid, text, count=1), bid


def to_learn(text):
    """ayu/ pages read the site data one level up (../); the served copy sits deeper, so it uses absolute paths."""
    text = text.replace('"../', '"/Ira0Ma058/').replace("'../", "'/Ira0Ma058/")
    return text.replace("icon-ayu.png", "/Ira0Ma058/icon-cup.png")


def build():
    out = {}
    ids = {}
    for n in DASH:
        p = AYU / (n + ".html")
        txt, ids[n] = stamp(p.read_text(encoding="utf-8"))
        out[p] = txt
    frag = (AYU / "index.src.html").read_text(encoding="utf-8")
    body = frag.split("\n", 2)[2]
    for n in DASH:
        old = 'src: "%s.html"' % n
        assert body.count(old) == 1, "index.src.html: expected one %r" % old
        body = body.replace(old, 'src: "%s.html?v=%s"' % (n, ids[n]))
    canvas = '</style>\n\n<canvas id="bg"'
    assert body.count(canvas) == 1, "index.src.html: the <canvas id=\"bg\"> anchor is missing"
    body = body.replace(canvas, '</style>\n</head>\n<body>\n<canvas id="bg"', 1)
    bid = hashlib.sha1((body + "".join(ids[n] for n in DASH)).encode()).hexdigest()[:10]
    out[AYU / "index.html"] = HEAD.replace("{build}", bid) + body + "\n</body>\n</html>\n"
    for n in DASH + ["index"]:
        out[LEARN / (n + ".html")] = to_learn(out[AYU / (n + ".html")])
    for f in COPY:
        out[LEARN / f] = to_learn((AYU / f).read_text(encoding="utf-8"))
    out[LEARN / "manifest.webmanifest"] = (REPO / "ayu-build" / "learn-manifest.webmanifest").read_text(encoding="utf-8")
    return out


def main():
    check = "--check" in sys.argv[1:]
    changed = []
    for path, txt in build().items():
        cur = path.read_text(encoding="utf-8") if path.exists() else None
        if cur != txt:
            changed.append(path.relative_to(REPO))
            if not check:
                path.write_text(txt, encoding="utf-8")
    if check:
        for c in changed:
            print("would change:", c)
        print("ayu build check:", "clean" if not changed else "%d file(s) differ" % len(changed))
        sys.exit(1 if changed else 0)
    print("ayu build: %d file(s) written" % len(changed))
    for c in changed:
        print("  ", c)


if __name__ == "__main__":
    main()
