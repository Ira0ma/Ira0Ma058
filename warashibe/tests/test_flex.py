"""任務1のテスト。サンプル入力（実数字なし）で生成し、体裁ルールを機械的に検証する。"""
from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import flex_builder as fb  # noqa: E402
import flex_lint as fl  # noqa: E402

SAMPLE = json.loads((ROOT / "samples/sample_input.json").read_text(encoding="utf-8"))
DISC = (ROOT / "samples/sample_disclaimer.txt").read_text(encoding="utf-8")


def walk(node):
    yield node
    if isinstance(node, dict):
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


def errors(msg, disc=DISC):
    return [f for f in fl.lint(msg, disc) if f.level == "error"]


class TestGenerate(unittest.TestCase):
    def setUp(self):
        self.msg = fb.build_message(copy.deepcopy(SAMPLE), DISC)
        self.bubbles = self.msg["contents"]["contents"]
        self.nodes = list(walk(self.msg["contents"]))

    def test_message_shape(self):
        self.assertEqual(self.msg["type"], "flex")
        self.assertEqual(self.msg["contents"]["type"], "carousel")
        self.assertEqual(self.msg["altText"], "朝刊わらしべ 第0号 考察配信（11月10日）")

    def test_bubble_count(self):
        self.assertEqual(len(self.bubbles), 11)
        self.assertLessEqual(len(self.bubbles), 12)
        self.assertTrue(all(b["size"] == "mega" for b in self.bubbles))

    def test_bubble_count_without_chart(self):
        c = copy.deepcopy(SAMPLE)
        c["bubbles"] = [b for b in c["bubbles"] if b["kind"] != "chart_figure"]
        m = fb.build_message(c, DISC)
        self.assertEqual(len(m["contents"]["contents"]), 10)
        self.assertEqual(errors(m), [])

    def test_text_styles(self):
        texts = [n for n in self.nodes if isinstance(n, dict) and n.get("type") == "text"]
        self.assertGreater(len(texts), 20)
        rule = {"#A8842C": ("lg", "bold", "2px"), "#888888": ("sm", "regular", "5px")}
        for t in texts:
            self.assertIn(t["color"], ("#A8842C", "#333333", "#888888"))
            self.assertTrue(t["scaling"])
            self.assertTrue(t["wrap"])
            if t["color"] in rule:
                self.assertEqual((t["size"], t["weight"], t["lineSpacing"]), rule[t["color"]])
            else:
                self.assertIn(t["size"], ("md", "sm"))
                self.assertEqual((t["weight"], t["lineSpacing"]), ("regular", "6px"))

    def test_key_numbers(self):
        spans = [n for n in self.nodes if isinstance(n, dict) and n.get("type") == "span"]
        keys = [s for s in spans if s["color"] == "#111111"]
        self.assertGreaterEqual(len(keys), 5)
        self.assertTrue(all(s["weight"] == "bold" for s in keys))

    def test_dense_bubble_uses_sm(self):
        review = self.bubbles[2]["body"]["contents"]
        body = [t for t in review if t.get("color") == "#333333"]
        self.assertTrue(body and all(t["size"] == "sm" for t in body))

    def test_no_pure_black(self):
        s = json.dumps(self.msg).upper()
        self.assertNotIn("#000000", s)

    def test_images_have_uri_action(self):
        imgs = [n for n in self.nodes if isinstance(n, dict) and n.get("type") == "image"]
        self.assertEqual(len(imgs), 1 + 1 + 5 + 1)  # 図説・ボード・セブン5ペア・チャート図
        for i in imgs:
            self.assertEqual(i["action"]["type"], "uri")
            self.assertEqual(i["action"]["uri"], i["url"])
            self.assertEqual((i["size"], i["aspectMode"]), ("full", "cover"))
            self.assertRegex(i["aspectRatio"], r"^\d+:\d+$")

    def test_seven_stacks(self):
        n_imgs = [sum(1 for c in b["body"]["contents"] if c["type"] == "image") for b in self.bubbles[3:5]]
        self.assertEqual(n_imgs, [2, 3])

    def test_disclaimer_is_last(self):
        last = self.bubbles[-1]["body"]["contents"][-1]
        self.assertEqual(last["text"], DISC.strip())
        self.assertEqual(last["color"], "#888888")
        self.assertIn("専業", json.dumps(self.bubbles[-1], ensure_ascii=False))

    def test_lint_passes(self):
        self.assertEqual(fl.lint(self.msg, DISC), [])


class TestLintCatches(unittest.TestCase):
    """チェッカーが違反を見逃さないこと（わざと壊して確かめる）。"""

    def setUp(self):
        self.msg = fb.build_message(copy.deepcopy(SAMPLE), DISC)

    def first(self, t):
        return next(n for n in walk(self.msg["contents"]) if isinstance(n, dict) and n.get("type") == t)

    def codes(self):
        return {f.code for f in errors(self.msg)}

    def test_black(self):
        self.first("text")["color"] = "#000000"; self.assertIn("C3", self.codes())
        self.msg["contents"]["contents"][0]["body"]["backgroundColor"] = "#000"
        self.assertIn("C2", self.codes())

    def test_missing_color(self):
        del self.first("text")["color"]; self.assertIn("C3", self.codes())

    def test_line_spacing(self):
        t = self.first("text"); del t["lineSpacing"]; self.assertIn("C4", self.codes())

    def test_wrong_line_spacing(self):
        self.first("text")["lineSpacing"] = "6px"; self.assertIn("C4", self.codes())  # 見出しは2px

    def test_scaling(self):
        self.first("text")["scaling"] = False; self.assertIn("C6", self.codes())

    def test_button_scaling(self):
        self.msg["contents"]["contents"][0]["body"]["contents"].append(
            {"type": "button", "action": {"type": "uri", "label": "x", "uri": "https://example.com"}})
        self.assertIn("C6", self.codes())

    def test_image_action(self):
        del self.first("image")["action"]; self.assertIn("C7", self.codes())

    def test_too_many_bubbles(self):
        bs = self.msg["contents"]["contents"]; bs += copy.deepcopy(bs[:2])
        self.assertEqual(len(bs), 13); self.assertIn("C1", self.codes())

    def test_disclaimer_moved(self):
        last = self.msg["contents"]["contents"][-1]["body"]["contents"]
        last.insert(0, last.pop()); self.assertIn("C8", self.codes())

    def test_disclaimer_text_mismatch(self):
        self.assertIn("C8", {f.code for f in errors(self.msg, "別の文面")})

    def test_key_not_bold(self):
        sp = next(n for n in walk(self.msg) if isinstance(n, dict) and n.get("color") == "#111111")
        sp["weight"] = "regular"; self.assertIn("C5", self.codes())

    def test_alt_text(self):
        self.msg["altText"] = ""; self.assertIn("C9", self.codes())

    def test_single_bubble_ok(self):
        b = self.msg["contents"]["contents"][-1]
        self.assertEqual(errors(b), [])


class TestInputValidation(unittest.TestCase):
    def bad(self, mutate):
        c = copy.deepcopy(SAMPLE); mutate(c)
        with self.assertRaises(fb.ContentError):
            fb.build_message(c, DISC)

    def test_wrong_order(self):
        self.bad(lambda c: c["bubbles"].insert(0, c["bubbles"].pop(1)))

    def test_shift_order(self):
        def m(c):
            c["bubbles"][-1]["shift"], c["bubbles"][-2]["shift"] = "夜勤", "専業"
        self.bad(m)

    def test_missing_pair(self):
        self.bad(lambda c: c["bubbles"][4]["pairs"].pop())

    def test_mixed_roles(self):
        self.bad(lambda c: c["bubbles"][0]["blocks"][0]["segments"].append({"role": "body", "text": "x"}))

    def test_http_image(self):
        def m(c):
            c["bubbles"][1]["blocks"][1]["url"] = "http://example.com/a.png"
        self.bad(m)

    def test_empty_disclaimer(self):
        with self.assertRaises(fb.ContentError):
            fb.build_message(copy.deepcopy(SAMPLE), "  ")

    def test_japanese_kind_names(self):
        c = copy.deepcopy(SAMPLE)
        jp = {"menu": "おしながき", "summary_figure": "図説", "review": "総評", "seven": "セブン積み",
              "lesson": "教室", "chart_figure": "チャート図", "edition": "版"}
        for b in c["bubbles"]:
            b["kind"] = jp[b["kind"]]
        self.assertEqual(errors(fb.build_message(c, DISC)), [])

    def test_non_default_split_warns(self):
        c = copy.deepcopy(SAMPLE)
        c["bubbles"][3]["pairs"].append(c["bubbles"][4]["pairs"].pop(0))
        self.assertTrue(fb.validate_content(c))


if __name__ == "__main__":
    unittest.main(verbosity=2)
