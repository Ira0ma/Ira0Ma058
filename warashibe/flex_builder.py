#!/usr/bin/env python3
"""朝刊わらしべ 考察配信 Flex メッセージ生成器（任務1）

その日のコンテンツ JSON（schema.md の形）と免責文（固定文）を受け取り、
体裁ルールを機械的に満たす LINE Messaging API 用の message オブジェクト
（type: flex + altText + carousel）を出力する。

  python flex_builder.py samples/sample_input.json \
      --disclaimer samples/sample_disclaimer.txt -o out.json

生成後に flex_lint.py の検査を必ず通し、違反があれば出力せずに失敗する。
数字の算出・文章づくりはしない（入力をそのまま並べるだけ）。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import flex_lint

# ---- 体裁ルール（編集長回答 2026-11-10 Q5/Q6/Q7 で確定） -------------------------
COLOR_HEADING = "#A8842C"
COLOR_BODY = "#333333"
COLOR_NOTE = "#888888"
COLOR_KEY = "#111111"

STYLE = {
    "heading": {"color": COLOR_HEADING, "size": "lg", "weight": "bold", "lineSpacing": "2px"},
    "body": {"color": COLOR_BODY, "size": "md", "weight": "regular", "lineSpacing": "6px"},
    "body_dense": {"color": COLOR_BODY, "size": "sm", "weight": "regular", "lineSpacing": "6px"},
    "note": {"color": COLOR_NOTE, "size": "sm", "weight": "regular", "lineSpacing": "5px"},
}
BUBBLE_SIZE = "mega"
MAX_BUBBLES = 12

# ---- バブル種別と並び順（Q4） ----------------------------------------------------
KIND_ALIASES = {
    "menu": "menu", "おしながき": "menu",
    "summary_figure": "summary_figure", "図説": "summary_figure",
    "review": "review", "総評": "review",
    "seven": "seven", "セブン積み": "seven",
    "lesson": "lesson", "教室": "lesson",
    "chart_figure": "chart_figure", "チャート図": "chart_figure",
    "edition": "edition", "版": "edition",
}
SHIFT_ALIASES = {
    "morning": "morning", "朝勤": "morning",
    "day": "day", "日勤": "day",
    "night": "night", "夜勤": "night",
    "full": "full", "専業": "full",
}
SHIFT_ORDER = ["morning", "day", "night", "full"]
PAIR_IDS = ["gold", "usdjpy", "silver", "usoil", "btc"]  # Q3
DEFAULT_SEVEN_SPLIT = [["gold", "usdjpy"], ["silver", "usoil", "btc"]]  # Q3 既定


class ContentError(ValueError):
    """入力 JSON が規約に合わない。推測で補わずに止める。"""


# ---- 入力の検証 -------------------------------------------------------------------
def _norm_kind(b: Dict[str, Any], i: int) -> str:
    k = b.get("kind")
    if k not in KIND_ALIASES:
        raise ContentError(f"bubbles[{i}].kind が不明です: {k!r}")
    return KIND_ALIASES[k]


def validate_content(content: Dict[str, Any]) -> List[str]:
    """致命的な違反は ContentError。既定と違うが許される点は警告として返す。"""
    warnings: List[str] = []
    if not isinstance(content.get("issue_no"), int):
        raise ContentError("issue_no（号数・整数）がありません")
    try:
        _dt.date.fromisoformat(str(content.get("date")))
    except ValueError:
        raise ContentError("date は YYYY-MM-DD で指定してください")
    bubbles = content.get("bubbles")
    if not isinstance(bubbles, list) or not bubbles:
        raise ContentError("bubbles（順序つき配列）がありません")

    kinds = [_norm_kind(b, i) for i, b in enumerate(bubbles)]
    shifts = [SHIFT_ALIASES.get(b.get("shift")) if k == "edition" else None
              for k, b in zip(kinds, bubbles)]
    expected = ["menu", "summary_figure", "review", "seven", "seven", "lesson"]
    if "chart_figure" in kinds:
        expected.append("chart_figure")
    expected += ["edition"] * 4
    if kinds != expected:
        raise ContentError(
            "バブルの並びが規約と違います。\n  期待: " + ", ".join(expected)
            + "\n  入力: " + ", ".join(kinds))
    if [s for s in shifts if s is not None] != SHIFT_ORDER or None in shifts[-4:]:
        raise ContentError("勤務形態別4版は shift=朝勤,日勤,夜勤,専業 の順で必要です")
    if len(bubbles) > MAX_BUBBLES:
        raise ContentError(f"バブル数 {len(bubbles)} が上限 {MAX_BUBBLES} を超えています")

    seen_pairs: List[str] = []
    split: List[List[str]] = []
    for i, (k, b) in enumerate(zip(kinds, bubbles)):
        where = f"bubbles[{i}]({k})"
        if k == "seven":
            pairs = b.get("pairs")
            if not isinstance(pairs, list) or not 2 <= len(pairs) <= 3:
                raise ContentError(f"{where}: pairs は 2〜3 ペアで指定してください")
            ids = []
            for j, p in enumerate(pairs):
                pid = p.get("pair")
                if pid not in PAIR_IDS:
                    raise ContentError(f"{where}.pairs[{j}].pair が不明です: {pid!r}")
                blocks = p.get("blocks") or []
                _validate_blocks(blocks, f"{where}.pairs[{j}]")
                if not any(bl.get("type") == "image" for bl in blocks):
                    raise ContentError(f"{where}.pairs[{j}]: 図（image）がありません")
                ids.append(pid)
            seen_pairs += ids
            split.append(ids)
        else:
            if "pairs" in b:
                raise ContentError(f"{where}: pairs は seven 以外では使えません")
            blocks = b.get("blocks") or []
            if not blocks:
                raise ContentError(f"{where}: blocks が空です")
            _validate_blocks(blocks, where)
            if k in ("summary_figure", "chart_figure") and not any(
                    bl.get("type") == "image" for bl in blocks):
                raise ContentError(f"{where}: 図説バブルに図（image）がありません")
    if sorted(seen_pairs) != sorted(PAIR_IDS):
        raise ContentError(
            f"日足セブンの5ペア（{', '.join(PAIR_IDS)}）が過不足なく入っていません: {seen_pairs}")
    if split != DEFAULT_SEVEN_SPLIT:
        warnings.append(f"日足セブンの積み方が既定と違います: {split}（既定 {DEFAULT_SEVEN_SPLIT}）")
    return warnings


def _validate_blocks(blocks: List[Dict[str, Any]], where: str) -> None:
    for j, bl in enumerate(blocks):
        t = bl.get("type")
        w = f"{where}.blocks[{j}]"
        if t == "text":
            _paragraph_role(bl.get("segments"), w)
        elif t == "image":
            url = bl.get("url", "")
            if not str(url).startswith("https://"):
                raise ContentError(f"{w}: 画像URLは https:// で始まる必要があります")
            wd, ht = bl.get("width"), bl.get("height")
            if not (isinstance(wd, int) and isinstance(ht, int) and wd > 0 and ht > 0):
                raise ContentError(f"{w}: width/height（実寸の正の整数）が必要です")
        elif t == "separator":
            pass
        else:
            raise ContentError(f"{w}: type は text / image / separator のどれかです: {t!r}")


def _paragraph_role(segments: Any, where: str) -> str:
    """段落の役割を決める。key（重要な数字）は段落の中に混ぜてよい。"""
    if not isinstance(segments, list) or not segments:
        raise ContentError(f"{where}: segments が空です")
    roles = set()
    for s in segments:
        r = s.get("role")
        if r not in ("heading", "body", "note", "key"):
            raise ContentError(f"{where}: role は heading/body/note/key のどれかです: {r!r}")
        if not isinstance(s.get("text"), str) or s["text"] == "":
            raise ContentError(f"{where}: セグメントの text が空です")
        roles.add(r)
    base = roles - {"key"}
    if len(base) > 1:
        raise ContentError(f"{where}: 1段落に {sorted(base)} が混在しています（段落を分けてください）")
    if base == {"heading"} and "key" in roles:
        raise ContentError(f"{where}: 見出しに key は混ぜられません")
    return base.pop() if base else "body"


# ---- 生成 -------------------------------------------------------------------------
def _text(segments: List[Dict[str, str]], dense: bool, where: str) -> Dict[str, Any]:
    role = _paragraph_role(segments, where)
    style = dict(STYLE["body_dense" if (role == "body" and dense) else role])
    comp: Dict[str, Any] = {
        "type": "text",
        "text": "".join(s["text"] for s in segments),
        "wrap": True,
        "scaling": True,
        **style,
    }
    if any(s["role"] == "key" for s in segments):
        spans = []
        for s in segments:
            if s["role"] == "key":
                spans.append({"type": "span", "text": s["text"], "color": COLOR_KEY,
                              "weight": "bold", "size": style["size"]})
            else:
                spans.append({"type": "span", "text": s["text"], "color": style["color"],
                              "weight": style["weight"], "size": style["size"]})
        comp["contents"] = spans
    return comp


def _image(bl: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "image",
        "url": bl["url"],
        "size": "full",
        "aspectRatio": f"{bl['width']}:{bl['height']}",
        "aspectMode": "cover",
        # 原寸を開く（Q7: 表示と同じURL）
        "action": {"type": "uri", "label": "原寸で見る", "uri": bl["url"]},
    }


def _blocks(blocks: List[Dict[str, Any]], dense: bool, where: str) -> List[Dict[str, Any]]:
    out = []
    for j, bl in enumerate(blocks):
        t = bl["type"]
        if t == "text":
            out.append(_text(bl["segments"], dense, f"{where}.blocks[{j}]"))
        elif t == "image":
            out.append(_image(bl))
        else:
            out.append({"type": "separator", "margin": "md"})
    return out


def build_alt_text(content: Dict[str, Any]) -> str:
    d = _dt.date.fromisoformat(content["date"])
    return f"朝刊わらしべ 第{content['issue_no']}号 考察配信（{d.month}月{d.day}日）"


def build_message(content: Dict[str, Any], disclaimer: str) -> Dict[str, Any]:
    if not disclaimer or not disclaimer.strip():
        raise ContentError("免責文が空です")
    validate_content(content)
    bubbles = []
    for i, b in enumerate(content["bubbles"]):
        kind = KIND_ALIASES[b["kind"]]
        dense = bool(b.get("dense"))
        where = f"bubbles[{i}]"
        if kind == "seven":
            body: List[Dict[str, Any]] = []
            for j, p in enumerate(b["pairs"]):
                if j:
                    body.append({"type": "separator", "margin": "lg"})
                body += _blocks(p["blocks"], dense, f"{where}.pairs[{j}]")
        else:
            body = _blocks(b["blocks"], dense, where)
        bubbles.append({
            "type": "bubble",
            "size": BUBBLE_SIZE,
            "body": {"type": "box", "layout": "vertical", "spacing": "md", "contents": body},
        })
    # 免責文は最後のバブル（専業版）の末尾に内包
    last = bubbles[-1]["body"]["contents"]
    last.append({"type": "separator", "margin": "lg"})
    last.append({"type": "text", "text": disclaimer.strip(), "wrap": True, "scaling": True,
                 **STYLE["note"]})
    return {
        "type": "flex",
        "altText": build_alt_text(content),
        "contents": {"type": "carousel", "contents": bubbles},
    }


def main(argv: List[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("content", help="その日のコンテンツ JSON")
    ap.add_argument("--disclaimer", required=True, help="免責文（固定文）のテキストファイル")
    ap.add_argument("-o", "--output", help="出力先（省略時は標準出力）")
    a = ap.parse_args(argv)
    content = json.loads(Path(a.content).read_text(encoding="utf-8"))
    disclaimer = Path(a.disclaimer).read_text(encoding="utf-8")
    try:
        for w in validate_content(content):
            print(f"[警告] {w}", file=sys.stderr)
        msg = build_message(content, disclaimer)
    except ContentError as e:
        print(f"[入力エラー] {e}", file=sys.stderr)
        return 2
    findings = flex_lint.lint(msg, disclaimer=disclaimer)
    errors = [f for f in findings if f.level == "error"]
    for f in findings:
        print(f"[{f.level}] {f.path}: {f.message}", file=sys.stderr)
    if errors:
        print("[失敗] 体裁検査に通らなかったため出力しません", file=sys.stderr)
        return 1
    text = json.dumps(msg, ensure_ascii=False, indent=2)
    if a.output:
        Path(a.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
