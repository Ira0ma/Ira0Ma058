// キュー1.5：あゆ版の通知音（desk_sound）・急変の記録（td_surge_v1）の保存キーずれの修正と、core.js のバックアップ対象の回帰テスト。
// 1) ホーム（生成元・生成物・配信用）がダッシュボードと同じ名前で読み書きすること（旧名は移行の処理にだけ残る）
// 2) 通知音：旧名の値は、新しい名前が空のときだけ移して古い名前を消す
// 3) 急変の記録：両方にあれば統合する（同じ日付なら id で重ね合わせ・確認済みはどちらか・検知順・最後の30件／日付が違えば新しい日付）
// 4) バックアップ：ダッシュボードが実際に書く名前（接頭辞なし）が対象に入り、ayu_ 付きの名前も引き続き対象であること
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const require = createRequire(import.meta.url);
const pages = {
  src: readFileSync(join(repo, "ayu", "index.src.html"), "utf-8"),
  root: readFileSync(join(repo, "ayu", "index.html"), "utf-8"),
  learn: readFileSync(join(repo, "ipad-widget", "learn", "ayu", "index.html"), "utf-8"),
};
const DASH = ["gold", "usdjpy", "btc", "oil", "silver"];

test("あゆ版：ダッシュボードは desk_sound と td_surge_v1 を使う", () => {
  for (const n of DASH) {
    const s = readFileSync(join(repo, "ayu", n + ".html"), "utf-8");
    assert.ok(s.includes("localStorage.getItem('desk_sound')"), n + "：通知音の名前");
    assert.ok(s.includes("const SG_KEY='td_surge_v1'"), n + "：急変の記録の名前");
  }
});

test("あゆ版：ホームがダッシュボードと同じ名前で読み書きする（旧名は移行の処理にだけ残る）", () => {
  for (const [name, s] of Object.entries(pages)) {
    assert.ok(s.includes('var sv = localStorage.getItem("desk_sound")'), name + "：通知音の読み取り");
    assert.ok(s.includes('localStorage.setItem("desk_sound", SOUND[soundIdx].k)'), name + "：通知音の保存");
    assert.ok(s.includes('sound: localStorage.getItem("desk_sound")'), name + "：診断（ツール）の通知音");
    assert.ok(s.includes('var SURGE_KEY = "td_surge_v1"'), name + "：急変の記録の名前");
    const rest = s.replace(/\(function ayuSoundKeyMigrate\(\) \{[\s\S]*?\n  \}\)\(\);/, "")
      .replace(/\(function ayuSurgeKeyMigrate\(\) \{[\s\S]*?\n  \}\)\(\);/, "")
      .replace(/\/\* キュー1\.5：[\s\S]*?\*\//g, "");  // 移行の説明のコメント
    assert.ok(!/ayu_desk_sound|ayu_td_surge_v1/.test(rest), name + "：旧名がまだ使われている");
  }
});

function run(fn, store, extra = "") {
  const m = pages.src.match(new RegExp("\\(function " + fn + "\\(\\) \\{[\\s\\S]*?\\n  \\}\\)\\(\\);"));
  assert.ok(m, fn + " が見つからない");
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  vm.runInNewContext(extra + m[0], { localStorage: ls, JSON });
  return store;
}

test("あゆ版 通知音：新しい名前が空なら移し、あれば上書きせず、旧名は消す", () => {
  assert.deepEqual(run("ayuSoundKeyMigrate", { ayu_desk_sound: "low" }), { desk_sound: "low" });
  assert.deepEqual(run("ayuSoundKeyMigrate", { ayu_desk_sound: "low", desk_sound: "off" }), { desk_sound: "off" });
  assert.deepEqual(run("ayuSoundKeyMigrate", { desk_sound: "high" }), { desk_sound: "high" });
});

const SK = 'var SURGE_KEY = "td_surge_v1";';
const ev = (id, at, ack = false) => ({ id, key: id.split("-")[0], level: "caution", at, ack });
const surge = (store) => run("ayuSurgeKeyMigrate", store, SK);

test("あゆ版 急変の記録：新しい名前が空なら旧名の記録をそのまま移す", () => {
  const old = JSON.stringify({ day: "2026-11-10", ev: [ev("gold-1", 1)] });
  const s = surge({ ayu_td_surge_v1: old });
  assert.deepEqual(Object.keys(s), ["td_surge_v1"]);
  assert.deepEqual(JSON.parse(s.td_surge_v1), JSON.parse(old));
});

test("あゆ版 急変の記録：同じ日付なら id で統合（重複は1件・確認済みはどちらか・検知順）", () => {
  const s = surge({
    ayu_td_surge_v1: JSON.stringify({ day: "2026-11-10", ev: [ev("gold-1", 10, true), ev("btc-5", 50)] }),
    td_surge_v1: JSON.stringify({ day: "2026-11-10", ev: [ev("gold-1", 10), ev("usdjpy-3", 30)] }),
  });
  assert.ok(!("ayu_td_surge_v1" in s));
  const st = JSON.parse(s.td_surge_v1);
  assert.equal(st.day, "2026-11-10");
  assert.deepEqual(st.ev.map((e) => e.id), ["gold-1", "usdjpy-3", "btc-5"]);
  assert.equal(st.ev[0].ack, true);
});

test("あゆ版 急変の記録：統合しても最後の30件まで", () => {
  const a = Array.from({ length: 20 }, (_, i) => ev("gold-a" + i, i * 2));
  const b = Array.from({ length: 20 }, (_, i) => ev("btc-b" + i, i * 2 + 1));
  const st = JSON.parse(surge({ ayu_td_surge_v1: JSON.stringify({ day: "2026-11-10", ev: a }), td_surge_v1: JSON.stringify({ day: "2026-11-10", ev: b }) }).td_surge_v1);
  assert.equal(st.ev.length, 30);
  assert.equal(st.ev[29].at, 39);
  assert.equal(st.ev[0].at, 10);
});

test("あゆ版 急変の記録：日付が違えば新しい日付の側を残す／壊れた旧名は消すだけ／旧名がなければ何もしない", () => {
  const newer = JSON.stringify({ day: "2026-11-10", ev: [ev("gold-1", 1)] }), older = JSON.stringify({ day: "2026-11-09", ev: [ev("btc-1", 1)] });
  assert.deepEqual(surge({ ayu_td_surge_v1: newer, td_surge_v1: older }), { td_surge_v1: newer });
  assert.deepEqual(surge({ ayu_td_surge_v1: older, td_surge_v1: newer }), { td_surge_v1: newer });
  assert.deepEqual(surge({ ayu_td_surge_v1: "{broken", td_surge_v1: newer }), { td_surge_v1: newer });
  assert.deepEqual(surge({ td_surge_v1: newer }), { td_surge_v1: newer });
});

test("あゆ版 core.js：ダッシュボードが実際に書く名前がバックアップの対象に入る（ayu_ 付きも引き続き対象）", () => {
  for (const path of [join(repo, "ayu", "core.js"), join(repo, "ipad-widget", "learn", "ayu", "core.js")]) {
    const C = require(path);
    const want = {
      gold_tf: "display", usoil_levels: "display", silver_tv_layout: "display", btc_chart_src: "display", tv_via_shortcut: "display",
      desk_sound: "notify", usdjpy_alerts: "notify", silver_alerts: "notify",
      gold_capital: "trading", usoil_risk_pct: "trading", silver_risk_yen: "trading", btc_risk_mode: "trading", gold_xm_contract: "trading", usdjpy_checks: "trading",
      ayu_desk_sound: "notify", ayu_gold_tf: "display", ayu_gold_capital: "trading", ayu_td_tax_v1: "trading",
      usoil_auto_cache_final: "cache", usoil_live_spot: "", btc_oil_adj: "", td_surge_v1: "",
    };
    for (const [k, g] of Object.entries(want)) assert.equal(C.groupOf(k), g, path + "：" + k);
  }
});
