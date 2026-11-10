// キュー1：あゆ版オイルの保存キーずれの修正の回帰テスト。
// あゆ版のオイルのダッシュボードは btc_oil_adj（MT5 補正値）・usoil_live_spot・usoil_auto_cache_final に保存する（本体と同じ名前）。
// あゆ版のホームが ayu_ 付きの名前を読んでいたため、ダッシュボードの補正値とライブ価格がホームに届かなかった。
// 1) ホーム（生成元・生成物・配信用）がダッシュボードと同じ名前で読むこと
// 2) 旧名（ayu_ 付き）に残った値は、新しい名前が空のときだけ移して古い名前を消すこと（新しい名前の値は上書きしない）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const pages = {
  src: readFileSync(join(repo, "ayu", "index.src.html"), "utf-8"),
  root: readFileSync(join(repo, "ayu", "index.html"), "utf-8"),
  learn: readFileSync(join(repo, "ipad-widget", "learn", "ayu", "index.html"), "utf-8"),
};
const oilDash = readFileSync(join(repo, "ayu", "oil.html"), "utf-8");

test("あゆ版オイル：ダッシュボードが保存する名前（btc_oil_adj・usoil_*）", () => {
  assert.ok(oilDash.includes("const LSP=INSTR.key+'_';"), "ダッシュボードの保存の接頭辞が変わった");
  assert.ok(oilDash.includes("lsSet(LSP+'live_spot'"));
  assert.ok(oilDash.includes("lsSet(LSP+'auto_cache_final'"));
  assert.ok(oilDash.includes("const KEY='btc_oil_adj'"));
});

test("あゆ版オイル：ホームがダッシュボードと同じ名前で読む（生成元・生成物・配信用）", () => {
  for (const [name, s] of Object.entries(pages)) {
    assert.ok(s.includes('var OIL_KEY = "btc_oil_adj"'), name + "：MT5 補正値の名前");
    assert.ok(s.includes('localStorage.getItem("usoil_live_spot")'), name + "：ライブ価格の名前");
    assert.equal((s.match(/localStorage\.getItem\("usoil_auto_cache_final"\)/g) || []).length, 2, name + "：定期取得の値の名前");
    assert.ok(s.includes('read("usoil_auto_cache_final")'), name + "：注目ポイントの読み取り");
    assert.ok(s.includes('e.key === "usoil_auto_cache_final" || e.key === "usoil_live_spot"'), name + "：他のタブからの更新の受け取り");
    // 旧名は移行の一覧にだけ残る
    const rest = s.replace(/\[\["ayu_btc_oil_adj"[^\n]*\n/, "");
    assert.ok(!/ayu_btc_oil_adj|ayu_usoil_/.test(rest), name + "：旧名がまだ読まれている");
  }
});

function migrateWith(store) {
  const m = pages.src.match(/\(function ayuOilKeyMigrate\(\) \{[\s\S]*?\n  \}\)\(\);/);
  assert.ok(m, "移行の処理が見つからない");
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  vm.runInNewContext(m[0], { localStorage: ls });
  return store;
}

test("あゆ版オイル：旧名の値を、新しい名前が空なら移して古い名前を消す", () => {
  const s = migrateWith({ ayu_btc_oil_adj: '{"hist":[{"diff":1.2}]}', ayu_usoil_live_spot: '{"price":80}', ayu_usoil_auto_cache_final: '{"spot":1}' });
  assert.deepEqual(s, { btc_oil_adj: '{"hist":[{"diff":1.2}]}', usoil_live_spot: '{"price":80}', usoil_auto_cache_final: '{"spot":1}' });
});

test("あゆ版オイル：新しい名前に値があれば上書きせず、古い名前だけ消す", () => {
  const s = migrateWith({ ayu_btc_oil_adj: "OLD", btc_oil_adj: "NEW" });
  assert.deepEqual(s, { btc_oil_adj: "NEW" });
});

test("あゆ版オイル：旧名がなければ何もしない（2回目以降も同じ）", () => {
  const s = migrateWith({ btc_oil_adj: "NEW", usoil_live_spot: "L" });
  assert.deepEqual(s, { btc_oil_adj: "NEW", usoil_live_spot: "L" });
  assert.deepEqual(migrateWith(s), { btc_oil_adj: "NEW", usoil_live_spot: "L" });
});
