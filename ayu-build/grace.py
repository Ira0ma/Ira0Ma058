#!/usr/bin/env python3
"""Desk of Ayu: add the `grace` theme (恵みの光 / Grace Light), make it the
no-saved-theme default, point icon references at icon-ayu.png, and fix the
pages.yml comment placement. Count-asserted, run once."""
from pathlib import Path

REPO = Path.home() / "workspace/trade-desk-work/repo"
AYU = REPO / "ayu"
BUILD = Path.home() / "workspace/trade-desk-work/ayu-build"

def patch(path, pairs):
    txt = path.read_text(encoding="utf-8")
    for old, new, cnt in pairs:
        n = txt.count(old)
        assert n == cnt, f"{path.name}: expected {cnt} of {old[:60]!r}, found {n}"
        txt = txt.replace(old, new)
    path.write_text(txt, encoding="utf-8")
    print("patched", path.name)

GRACE_VARS = """html[data-theme="grace"] {
  /* 恵みの光（Desk of Ayu 専用・プロテスタント仕様）：夜明けの空に柔らかい光の筋、遠景の丘と小さな十字架のシルエット。
     手動でのみ選べるテーマ（季節の自動切替には入らない）。このコピーでは未設定時の初期表示でもある。
     背景は THEME_BG.grace の graceScene（静止画は #bg、呼吸する光は #bg4）。判定色は :root と同じ値。
     カードの地は他のテーマと同じ暗いガラスにして、明るい夜明けの上でも文字が読めるようにする */
  --night: #070a1c; --glass: rgba(10, 11, 24, 0.86); --glass-line: rgba(255, 205, 130, 0.42);
  --ink: #f7f2e7; --ink-2: rgba(247, 242, 231, 0.74); --ink-3: rgba(247, 242, 231, 0.50);
  --gold: #eec27f; --gold-rgb: 238, 194, 127; --gold-soft: rgba(238, 194, 127, 0.22); --gold-deep: #b98c46;
  --on-accent: #1a1206; --panel-rgb: 12, 12, 24;
  --up-red: #ff6a5c; --up-green: #43d27f; --star: #f0573f;
  --head-points: #ffd9a0; --head-weather: #ffb98a; --head-ind: #ffd9a0; --head-cal: #ffb98a; --head-x: #ffb98a; --head-books: #ffd9a0;
  --strip-bg: linear-gradient(90deg, #8a6cff, #e98a5a, #ffc95e, #ffe9a8); --strip-size: 100% 100%;
}
"""

GRACE_BG4_CSS = """
/* 恵みの光：十字架の背後の光がゆっくり呼吸する（#bg4 は graceScene が描く）。省電力・動きを減らす設定では静止 */
html[data-theme="grace"] #bg4 { display: block; animation: td-grace-breathe 9s ease-in-out infinite alternate; }
@keyframes td-grace-breathe { from { opacity: 0.35; } to { opacity: 0.85; } }
html[data-theme="grace"].lowpower #bg4 { opacity: 0.45; }
@media (prefers-reduced-motion: reduce) { html[data-theme="grace"] #bg4 { animation: none; opacity: 0.45; } }
"""

GRACE_SCENE = """        if (TB.graceScene) {
          // 恵みの光（Desk of Ayu 専用）：夜明けの空。深い藍から金へのグラデーション、柔らかい光の筋、
          // 遠景の丘の稜線と、その上に小さな十字架のシルエット。文字・鳩は入れない。カトリック特有のモチーフも使わない。
          // 静止画は #bg、呼吸する光だけ #bg4 に分けて描く（CSS の td-grace-breathe でゆっくり明滅）。
          // 座標はステージ（1210x841）基準。リサイズ時に1回だけ描く
          var gsc = Math.min(w / 1210, h / 841), gox = (w - 1210 * gsc) / 2, goy = (h - 841 * gsc) / 2;
          function GX(sx) { return gox + sx * gsc; }
          function GY(sy) { return goy + sy * gsc; }
          var gr = rng(31);
          // 空：深い藍 → 紫 → 金（地平線は画面の下寄り）
          var gsky = x.createLinearGradient(0, GY(0), 0, GY(841));
          gsky.addColorStop(0, "#05081f"); gsky.addColorStop(0.30, "#101a44"); gsky.addColorStop(0.52, "#2e2a5e");
          gsky.addColorStop(0.66, "#6e4a63"); gsky.addColorStop(0.76, "#c07f3e"); gsky.addColorStop(0.84, "#ecb95e"); gsky.addColorStop(0.90, "#f8da8a");
          gsky.addColorStop(1, "#4a3040");
          x.fillStyle = gsky; x.fillRect(0, 0, w, h);
          // 星：上空にだけ残る（下へ行くほど薄い）
          for (var gi = 0; gi < 130; gi++) {
            var gsx = gr() * 1210, gsy = gr() * 430, gsa = (1 - gsy / 430) * (0.25 + gr() * 0.55);
            x.fillStyle = "rgba(235,240,255," + gsa.toFixed(3) + ")";
            var gss = gr() < 0.12 ? 1.8 : 1.1;
            x.fillRect(GX(gsx), GY(gsy), gss * gsc + 0.4, gss * gsc + 0.4);
          }
          // 雲の帯：横に長い柔らかなにじみ（桃・金）
          [[300, 300, 420, 34, "rgba(255,170,150,0.10)"], [760, 380, 520, 40, "rgba(255,190,120,0.10)"], [520, 470, 640, 44, "rgba(255,205,130,0.12)"], [180, 520, 380, 30, "rgba(240,150,130,0.08)"]].forEach(function (cl) {
            var cg = x.createRadialGradient(GX(cl[0]), GY(cl[1]), 0, GX(cl[0]), GY(cl[1]), cl[2] * gsc);
            cg.addColorStop(0, cl[4]); cg.addColorStop(1, "rgba(0,0,0,0)");
            x.save(); x.translate(GX(cl[0]), GY(cl[1])); x.scale(1, cl[3] / cl[2]); x.translate(-GX(cl[0]), -GY(cl[1]));
            x.fillStyle = cg; x.fillRect(0, 0, w, h); x.restore();
          });
          // 光の源：地平線の一点（十字架の背後）からの放射グロー
          var gsun = x.createRadialGradient(GX(605), GY(668), 0, GX(605), GY(668), 430 * gsc);
          gsun.addColorStop(0, "rgba(255,236,180,0.85)"); gsun.addColorStop(0.25, "rgba(255,205,110,0.38)"); gsun.addColorStop(0.6, "rgba(255,180,90,0.12)"); gsun.addColorStop(1, "rgba(255,180,90,0)");
          x.fillStyle = gsun; x.fillRect(0, 0, w, h);
          // 光の筋：源から上空へ扇状に広がる柔らかな帯
          x.save(); x.translate(GX(605), GY(668)); x.globalCompositeOperation = "lighter";
          [-0.62, -0.38, -0.16, 0.05, 0.28, 0.52].forEach(function (ra, ri) {
            var rg2 = x.createLinearGradient(0, 0, 0, -760 * gsc);
            rg2.addColorStop(0, "rgba(255,220,150," + (ri % 2 ? 0.10 : 0.14) + ")"); rg2.addColorStop(1, "rgba(255,220,150,0)");
            x.save(); x.rotate(ra); x.fillStyle = rg2;
            x.beginPath(); x.moveTo(-13 * gsc, 0); x.lineTo(13 * gsc, 0); x.lineTo(46 * gsc, -760 * gsc); x.lineTo(-46 * gsc, -760 * gsc); x.closePath(); x.fill(); x.restore();
          });
          x.restore();
          // 遠景の稜線（奥→手前で濃く）
          function ridge(pts, col) {
            x.fillStyle = col; x.beginPath(); x.moveTo(GX(-20), GY(841));
            x.lineTo(GX(pts[0][0]), GY(pts[0][1]));
            for (var pi = 1; pi < pts.length; pi++) {
              var pmx = (pts[pi - 1][0] + pts[pi][0]) / 2, pmy = (pts[pi - 1][1] + pts[pi][1]) / 2;
              x.quadraticCurveTo(GX(pts[pi - 1][0]), GY(pts[pi - 1][1]), GX(pmx), GY(pmy));
            }
            x.lineTo(GX(pts[pts.length - 1][0]), GY(pts[pts.length - 1][1])); x.lineTo(GX(1230), GY(841)); x.closePath(); x.fill();
          }
          ridge([[-20, 618], [180, 588], [420, 622], [700, 585], [950, 620], [1230, 590]], "#2a3062");
          ridge([[-20, 676], [220, 640], [520, 682], [820, 645], [1060, 678], [1230, 650]], "#1a2047");
          // 手前の丘：中央に緩やかな頂き（十字架の立つ場所）
          x.fillStyle = "#0c1029"; x.beginPath();
          x.moveTo(GX(-20), GY(841)); x.lineTo(GX(-20), GY(760));
          x.quadraticCurveTo(GX(300), GY(706), GX(605), GY(668));
          x.quadraticCurveTo(GX(910), GY(706), GX(1230), GY(762));
          x.lineTo(GX(1230), GY(841)); x.closePath(); x.fill();
          // 地平線の霧：丘の際を柔らかく光らせる帯
          var gmist = x.createLinearGradient(0, GY(636), 0, GY(706));
          gmist.addColorStop(0, "rgba(255,225,170,0)"); gmist.addColorStop(0.5, "rgba(255,225,170,0.13)"); gmist.addColorStop(1, "rgba(255,225,170,0)");
          x.fillStyle = gmist; x.fillRect(0, GY(636), w, GY(706) - GY(636));
          // 十字架のシルエット（丘の頂き・光の中心）
          x.fillStyle = "#04050d";
          var gcw = 7 * gsc, gch = 56 * gsc, gbx = GX(605), gby = GY(672);
          x.fillRect(gbx - gcw / 2, gby - gch, gcw, gch);
          x.fillRect(gbx - 17 * gsc, gby - gch + 15 * gsc, 34 * gsc, 6 * gsc);
          // 下端の影（画面を締める）
          var gvig = x.createLinearGradient(0, GY(700), 0, GY(841));
          gvig.addColorStop(0, "rgba(3,4,10,0)"); gvig.addColorStop(1, "rgba(3,4,10,0.42)");
          x.fillStyle = gvig; x.fillRect(0, GY(700), w, GY(841) - GY(700));
          // 呼吸する光の層（#bg4）：十字架の背後のグローだけを別層に（CSS でゆっくり明滅）
          var x4 = layer(cv4).c;
          var g4 = x4.createRadialGradient(GX(605), GY(668), 0, GX(605), GY(668), 470 * gsc);
          g4.addColorStop(0, "rgba(255,232,175,0.55)"); g4.addColorStop(0.35, "rgba(255,205,110,0.22)"); g4.addColorStop(1, "rgba(255,190,95,0)");
          x4.fillStyle = g4; x4.fillRect(0, 0, w, h);
        }
"""

patch(AYU / "index.src.html", [
    # theme variable block (after the aurora block)
    ('  --strip-bg: linear-gradient(90deg, #5cffab, #3fd2e6, #7d9bff, #c07dff, #ff82aa); --strip-size: 100% 100%;\n}\n',
     '  --strip-bg: linear-gradient(90deg, #5cffab, #3fd2e6, #7d9bff, #c07dff, #ff82aa); --strip-size: 100% 100%;\n}\n' + GRACE_VARS, 1),
    # #bg4 breathe CSS (after the neon reduced-motion rule)
    ('@media (prefers-reduced-motion: reduce) { html[data-theme="neon"] #bg4 { animation: none; opacity: 0.30; } }',
     '@media (prefers-reduced-motion: reduce) { html[data-theme="neon"] #bg4 { animation: none; opacity: 0.30; } }' + GRACE_BG4_CSS, 1),
    # bootstrap comment + NAMES registration
    ('shippu = 利確の炎、aurora = 安らぎのオーロラ（どちらも手動のみ、季節の自動切替には入らない）。 */',
     'shippu = 利確の炎、aurora = 安らぎのオーロラ（どちらも手動のみ、季節の自動切替には入らない）。grace = 恵みの光（Desk of Ayu 専用・手動のみ・未設定時の初期表示）。 */', 1),
    ('  var NAMES = ["current", "neon", "spring", "autumn", "xmas", "newyear", "winter", "shippu", "aurora"];',
     '  var NAMES = ["current", "neon", "spring", "autumn", "xmas", "newyear", "winter", "shippu", "aurora", "grace"];', 1),
    # no-saved-theme fallback: bootstrap read + date-change watcher + popover mode + TDThemeApply
    ('  var mode = "auto";\n  try { mode = localStorage.getItem("ayu_td_theme") || "auto"; } catch (e) {}',
     '  var mode = "grace";\n  try { mode = localStorage.getItem("ayu_td_theme") || "grace"; } catch (e) {}', 1),
    ('      var m2 = "auto";\n      try { m2 = localStorage.getItem("ayu_td_theme") || "auto"; } catch (e) {}',
     '      var m2 = "grace";\n      try { m2 = localStorage.getItem("ayu_td_theme") || "grace"; } catch (e) {}', 1),
    ('  var themeModeNow = function () { try { return localStorage.getItem("ayu_td_theme") || "auto"; } catch (e) { return "auto"; } };',
     '  var themeModeNow = function () { try { return localStorage.getItem("ayu_td_theme") || "grace"; } catch (e) { return "grace"; } };', 1),
    ('    var mode = "auto";\n    try { mode = localStorage.getItem("ayu_td_theme") || "auto"; } catch (e) {}',
     '    var mode = "grace";\n    try { mode = localStorage.getItem("ayu_td_theme") || "grace"; } catch (e) {}', 1),
    # popover list + names
    ('["current", "基本デザイン"], ["neon", "アゲアゲ⭐︎ネオン"]',
     '["current", "基本デザイン"], ["grace", "恵みの光"], ["neon", "アゲアゲ⭐︎ネオン"]', 1),
    ('current: "基本デザイン", neon: "アゲアゲ⭐︎ネオン"',
     'current: "基本デザイン", grace: "恵みの光", neon: "アゲアゲ⭐︎ネオン"', 1),
    # scene registration + painter
    ('      aurora: { auroraScene: 1, base: "#05070f", dot: "190,214,255", glows: [] }',
     '      aurora: { auroraScene: 1, base: "#05070f", dot: "190,214,255", glows: [] },\n      grace: { graceScene: 1, base: "#070a1c", dot: "255,226,170", glows: [] }', 1),
    ('        if (TB.glowsHi) {', GRACE_SCENE + '        if (TB.glowsHi) {', 1),
    # notification icon -> the fork's own icon file
    ('    var opt = { body: body, tag: tag, icon: "icon-cup.png", badge: "icon-cup.png", data: { url: location.href } };',
     '    var opt = { body: body, tag: tag, icon: "icon-ayu.png", badge: "icon-ayu.png", data: { url: location.href } };', 1),
    # i18n: theme name in the dictionary (both languages)
    ('otLabel: "旧約聖書（39書）", ntLabel: "新約聖書（27書）" }',
     'otLabel: "旧約聖書（39書）", ntLabel: "新約聖書（27書）", themeGrace: "恵みの光" }', 1),
    ('otLabel: "Old Testament (39 books)", ntLabel: "New Testament (27 books)" }',
     'otLabel: "Old Testament (39 books)", ntLabel: "New Testament (27 books)", themeGrace: "Grace Light" }', 1),
    # i18n: theme button + popover relabel inside TDLangApply
    ('    var va = document.getElementById("vs-aside"); if (va) va.textContent = L.verseAside;',
     '    var va = document.getElementById("vs-aside"); if (va) va.textContent = L.verseAside;\n'
     '    var tbtn = document.getElementById("theme-toggle");\n'
     '    if (tbtn) {\n'
     '      if (lang() === "en" && tbtn.textContent.indexOf("恵みの光") >= 0) tbtn.textContent = tbtn.textContent.replace("恵みの光", "Grace Light");\n'
     '      if (lang() !== "en" && tbtn.textContent.indexOf("Grace Light") >= 0) tbtn.textContent = tbtn.textContent.replace("Grace Light", "恵みの光");\n'
     '    }\n'
     '    var gpop = document.querySelector(\'.dk-theme-pop button[data-mode="grace"]\');\n'
     '    if (gpop) gpop.innerHTML = \'<span class="dot"></span>\' + L.themeGrace;', 1),
    # i18n: relabel after the popover opens / a theme is picked (the app repaints with JA labels)
    ('  /* layout button repaint in the current language after the app repaints it */',
     '  document.addEventListener("click", function (ev) {\n'
     '    if (!ev.target || !ev.target.closest) return;\n'
     '    if (ev.target.id === "theme-toggle") setTimeout(function () { window.TDLangApply(); }, 0);\n'
     '    else if (ev.target.closest(\'.dk-theme-pop button[data-mode]\')) setTimeout(function () { window.TDLangApply(); }, 30);\n'
     '  });\n'
     '  /* layout button repaint in the current language after the app repaints it */', 1),
])

patch(AYU / "tools.js", [
    ('      var themeNow = "auto"; try { themeNow = LS.getItem("ayu_td_theme") || "auto"; } catch (e) {}',
     '      var themeNow = "grace"; try { themeNow = LS.getItem("ayu_td_theme") || "grace"; } catch (e) {}', 1),
    ('["current", "基本デザイン"], ["neon", "アゲアゲ⭐︎ネオン"]',
     '["current", "基本デザイン"], ["grace", tdLang() === "en" ? "Grace Light" : "恵みの光"], ["neon", "アゲアゲ⭐︎ネオン"]', 1),
    ('      $("#st-lang").addEventListener("change", function () { try { LS.setItem("ayu_td_lang", this.value); } catch (e) {} paintTabLabels(); if (window.TDLangApply) window.TDLangApply(); });',
     '      $("#st-lang").addEventListener("change", function () { try { LS.setItem("ayu_td_lang", this.value); } catch (e) {} var go = $("#st-theme option[value=\\"grace\\"]"); if (go) go.textContent = this.value === "en" ? "Grace Light" : "恵みの光"; paintTabLabels(); if (window.TDLangApply) window.TDLangApply(); });', 1),
])

# icon references in the generator head
patch(BUILD / "generate.py", [
    ('<link rel="apple-touch-icon" href="icon-cup.png">', '<link rel="apple-touch-icon" href="icon-ayu.png">', 1),
    ('<link rel="icon" type="image/png" href="icon-cup.png">', '<link rel="icon" type="image/png" href="icon-ayu.png">', 1),
])

# manifest: point icons at icon-ayu.png (file itself arrives at deploy time)
man = AYU / "manifest.webmanifest"
mtxt = man.read_text(encoding="utf-8")
assert '"src": "icon-cup.png", "sizes": "180x180"' in mtxt
man.write_text(mtxt.replace('"src": "icon-cup.png", "sizes": "180x180"', '"src": "icon-ayu.png", "sizes": "1024x1024"'), encoding="utf-8")
print("patched manifest.webmanifest")

# pages.yml: restore the core.js comment and give the ayu line its own
patch(REPO / ".github/workflows/pages.yml", [
    ('          cp ipad-widget/core.js _site/core.js\n          [ -d ayu ] && cp -r ayu _site/ayu || true  # rules shared by the desk and its tools (market hours, freshness, sizing, signal history)',
     '          cp ipad-widget/core.js _site/core.js  # rules shared by the desk and its tools (market hours, freshness, sizing, signal history)\n          [ -d ayu ] && cp -r ayu _site/ayu || true  # Desk of Ayu fork (gift copy with the Bible corner); only when present', 1),
])

print("grace OK")
