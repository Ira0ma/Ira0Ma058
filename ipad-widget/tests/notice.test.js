// お知らせバー（確定申告タブ追加・一度だけ表示）の判定ロジックの検証。tools.js の [notice-pure] ブロックを切り出して評価する
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const core = fs.readFileSync(new URL("../core.js", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../tools.js", import.meta.url), "utf8");
function block(src, name) {
  const a = src.indexOf("// [" + name + "-begin]"), b = src.indexOf("// [" + name + "-end]");
  assert.ok(a >= 0 && b > a, name + " ブロックが tools.js にある");
  return src.slice(a, b);
}
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(core + "\nthis.C = TDCore;", sandbox);
assert.ok(sandbox.C && typeof sandbox.C.groupOf === "function", "TDCore が読み込める");
vm.runInContext(block(tools, "notice-pure"), sandbox);
const noticeTaxSeen = vm.runInContext("noticeTaxSeen", sandbox), noticeTaxMark = vm.runInContext("noticeTaxMark", sandbox);
const NOTICE_TAX_KEY = vm.runInContext("NOTICE_TAX_KEY", sandbox);

function fakeStore(init) {
  const m = Object.assign({}, init);
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
}

test("notice: 判定キーは td_notice_tax_v1 で、バックアップ対象外（UI状態）", () => {
  assert.equal(NOTICE_TAX_KEY, "td_notice_tax_v1");
  assert.equal(sandbox.C.groupOf("td_notice_tax_v1"), "", "core.js の GROUPS に入っていない");
});

test("notice: 初回は未表示→表示対象、記録後は二度と表示対象にならない", () => {
  const s = fakeStore();
  assert.equal(noticeTaxSeen(s), false, "空のストレージでは未表示");
  noticeTaxMark(s);
  assert.equal(s._m["td_notice_tax_v1"], "1", "キーに 1 が記録される");
  assert.equal(noticeTaxSeen(s), true, "記録後は表示済み");
  assert.equal(noticeTaxSeen(fakeStore({ td_notice_tax_v1: "1" })), true, "別セッションでも表示済み");
});

test("notice: ストレージが例外を投げても落ちない（読めない環境では出さない安全側）", () => {
  const bad = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(noticeTaxSeen(bad), true);
  noticeTaxMark(bad); // 例外を投げないこと
});

test("notice: tools.js にバー・文言・2つのボタンと open への結線が入っている", () => {
  assert.match(tools, /class="tdt-notice" role="note" hidden/);
  assert.match(tools, /お知らせ：ツールに『確定申告』タブが追加されました。トレード収支・日誌・家計簿の記録と連動して、確定申告の計算と整理ができます。/);
  assert.match(tools, /<button type="button" class="go">開いてみる<\/button>/);
  assert.match(tools, /class="x" aria-label="お知らせを閉じる">✕<\/button>/);
  assert.match(tools, /box\.hidden = false; renderTaxNotice\(\); show\(tab\);/, "ツールを開いたときに判定が走る");
  assert.match(tools, /dismissTaxNotice\(\); show\("tax"\)/, "「開いてみる」で確定申告タブへ切り替える");
  assert.match(tools, /\.tdt-notice\{display:flex;/, "バーのスタイルがある");
  assert.match(tools, /\.tdt-notice\[hidden\]\{display:none\}/);
});
