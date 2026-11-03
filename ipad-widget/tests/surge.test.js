// 急変検知（タスク6）：しきい値・途切れ・発報の間隔・文言
const test = require("node:test");
const assert = require("node:assert");
const C = require("../core.js");
const T0 = Date.UTC(2026, 10, 4, 1, 0, 0);  // 平日の東京時間
// a tick every 10 seconds moving linearly from p0 to p1 over the given minutes
function ticks(p0, p1, minutes, src, t0) {
  var list = [], n = minutes * 6;
  for (var i = 0; i <= n; i++) list = C.surgeAdd(list, (t0 || T0) + i * 10000, p0 + (p1 - p0) * i / n, src || "ws");
  return list;
}
test("ドル円：5分で −0.60円は注意、−1.20円は緊急", () => {
  var a = ticks(152, 151.4, 5), r = C.surgeCheck("usdjpy", a, a[a.length - 1].t);
  assert.equal(r.level, "caution"); assert.equal(r.dir, "down"); assert.equal(r.win, 5); assert.ok(Math.abs(r.delta + 0.6) < 1e-9);
  var b = ticks(152, 150.8, 5), r2 = C.surgeCheck("usdjpy", b, b[b.length - 1].t);
  assert.equal(r2.level, "emergency"); assert.ok(Math.abs(r2.delta + 1.2) < 1e-9);
  var c = ticks(152, 151.6, 5); assert.equal(C.surgeCheck("usdjpy", c, c[c.length - 1].t), null);  // 0.40円は何もなし
});
test("ドル円：15分で1.50円は緊急、5分ルールの外の0.60円は対象外", () => {
  var a = ticks(150, 151.5, 15), r = C.surgeCheck("usdjpy", a, a[a.length - 1].t);
  assert.equal(r.level, "emergency"); assert.equal(r.win, 15); assert.equal(r.dir, "up");
  var b = ticks(150, 150.9, 15); assert.equal(C.surgeCheck("usdjpy", b, b[b.length - 1].t), null);  // 5分では0.30円
});
test("ゴールド・BTC・オイル：15分の％でしきい値どおり", () => {
  [["gold", 0.7, 1.2], ["btc", 1.0, 2.0], ["usoil", 1.0, 2.0]].forEach(function (k) {
    var lo = ticks(100, 100 * (1 - (k[1] + 0.05) / 100), 15), hi = ticks(100, 100 * (1 + (k[2] + 0.05) / 100), 15), no = ticks(100, 100 * (1 - (k[1] - 0.1) / 100), 15);
    assert.equal(C.surgeCheck(k[0], lo, lo[lo.length - 1].t).level, "caution", k[0]);
    assert.equal(C.surgeCheck(k[0], hi, hi[hi.length - 1].t).level, "emergency", k[0]);
    assert.equal(C.surgeCheck(k[0], no, no[no.length - 1].t), null, k[0]);
  });
});
test("90秒を超える途切れ・提供元の切り替えをまたいで計算しない", () => {
  var a = ticks(152, 152, 3), b = a.concat(ticks(150.8, 150.8, 2, "ws", a[a.length - 1].t + 95000));
  assert.equal(C.surgeCheck("usdjpy", b, b[b.length - 1].t), null);
  var c = ticks(152, 152, 3), d = c.concat(ticks(150.8, 150.8, 1, "poll", c[c.length - 1].t + 10000));
  assert.equal(C.surgeCheck("usdjpy", d, d[d.length - 1].t), null);
  var e = ticks(152, 150.8, 5); assert.equal(C.surgeCheck("usdjpy", e, e[e.length - 1].t + 91000), null);  // 最新のサンプルが古い
});
test("発報の間隔：同じ向き・同じ段階は30分出さない。注意→緊急はすぐ出す", () => {
  var st = {}, r = { level: "caution", dir: "down" }, g = C.surgeGate(st, r, T0);
  assert.equal(g.alert, true);
  assert.equal(C.surgeGate(g.state, r, T0 + 10 * 60000).alert, false);
  assert.equal(C.surgeGate(g.state, { level: "emergency", dir: "down" }, T0 + 11 * 60000).alert, true);
  assert.equal(C.surgeGate(g.state, { level: "emergency", dir: "down" }, T0 + 20 * 60000).alert, false);
  assert.equal(C.surgeGate(g.state, { level: "caution", dir: "down" }, T0 + 25 * 60000).alert, false);  // 緊急のあとの注意
  assert.equal(C.surgeGate(g.state, { level: "caution", dir: "up" }, T0 + 25 * 60000).alert, true);  // 逆の向きは別
  assert.equal(C.surgeGate(g.state, { level: "emergency", dir: "down" }, T0 + 42 * 60000).alert, true);  // 30分たった
});
test("文言：円高は「円高方向」、円安方向も緊急になり、介入の断定や価格水準は出ない", () => {
  var dn = ticks(152, 150.8, 5), up = ticks(150.8, 152, 5);
  var a = C.surgeText(C.surgeCheck("usdjpy", dn, dn[dn.length - 1].t)), b = C.surgeText(C.surgeCheck("usdjpy", up, up[up.length - 1].t));
  assert.equal(a.head, "ドル円が急変（円高方向）"); assert.equal(a.size, "5分で −1.20円"); assert.equal(a.level, "緊急");
  assert.equal(b.head, "ドル円が急変（円安方向）"); assert.equal(b.level, "緊急");
  [a, b].forEach(function (x) { assert.doesNotMatch(JSON.stringify(x), /介入|防衛線|ライン/); });
});
test("介入警戒の見出し：ドル円・24時間以内の最新1件だけ", () => {
  var now = T0, h = 3600;
  var news = { items: [
    { t: now / 1000 - 2 * h, title: "A", tone: "intervention", pages: ["usdjpy", "gold"], who: "財務省" },
    { t: now / 1000 - 1 * h, title: "B", tone: "hawkish", pages: ["usdjpy"], who: "日銀" },
    { t: now / 1000 - 30 * h, title: "C", tone: "intervention", pages: ["usdjpy"], who: "財務省" },
    { t: now / 1000 - 0.5 * h, title: "D", tone: "intervention", pages: ["gold"], who: "財務省" }] };
  assert.equal(C.interventionPick(news, now).title, "A");
  assert.equal(C.interventionPick({ items: [news.items[2]] }, now), null);
  assert.equal(C.interventionPick(null, now), null);
});
