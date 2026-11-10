#!/usr/bin/env python3
"""朝刊わらしべ Flex 体裁チェッカー（単独で動く・手組みFlexの点検にも使える）

  python flex_lint.py message.json [--disclaimer disclaimer.txt] [--json]

入力は LINE Messaging API の message オブジェクト（type: flex）、
または contents だけ（carousel / bubble）でもよい。
違反（error）が1つでもあれば終了コード 1。標準ライブラリだけで動く。

検査項目
  C1 バブル数が 1〜12
  C2 真っ黒（#000000 / #000 / #000000FF 等）がどこにも無い
  C3 テキストの色が規定4色（見出し #A8842C / 本文 #333333 / 注釈 #888888 / 重要数字 #111111）
  C4 すべてのテキストに lineSpacing（見出し2px・本文6px・注釈5px）
  C5 役割ごとの大きさと太さ（見出し lg・bold / 本文 md か sm・regular / 注釈 sm・regular /
     重要数字 bold）
  C6 すべての text と button に scaling: true
  C7 すべての image に URI アクション（https）
  C8 最後のバブルの最後の要素が免責文（--disclaimer 指定時は文面も一致）
  C9 altText がある（type: flex のとき）
  W1（警告）サイズの目安超過など
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterator, List, Optional, Tuple

MAX_BUBBLES = 12
HEADING, BODY, NOTE, KEY = "#A8842C", "#333333", "#888888", "#111111"
PALETTE = {HEADING, BODY, NOTE, KEY}
EXPECT = {
    HEADING: {"size": {"lg"}, "weight": "bold", "lineSpacing": "2px", "name": "見出し"},
    BODY: {"size": {"md", "sm"}, "weight": "regular", "lineSpacing": "6px", "name": "本文"},
    NOTE: {"size": {"sm"}, "weight": "regular", "lineSpacing": "5px", "name": "注釈"},
    KEY: {"size": None, "weight": "bold", "lineSpacing": None, "name": "重要数字"},
}
COLOR_KEYS = ("color", "backgroundColor", "borderColor", "separatorColor")
_BLACK = re.compile(r"^#0{3}(0{3})?(f{2})?$", re.I)


@dataclass
class Finding:
    level: str  # "error" | "warning"
    code: str
    path: str
    message: str


def _walk(node: Any, path: str) -> Iterator[Tuple[str, Any]]:
    yield path, node
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, f"{path}[{i}]")


def _norm(c: Any) -> str:
    return str(c).upper() if isinstance(c, str) else ""


def _last_leaf(box: Any) -> Optional[Any]:
    """box の見た目上いちばん最後の要素（入れ子の box もたどる）。"""
    while isinstance(box, dict) and box.get("type") == "box" and box.get("contents"):
        box = box["contents"][-1]
    return box


def lint(message: Any, disclaimer: Optional[str] = None) -> List[Finding]:
    out: List[Finding] = []

    def err(code: str, path: str, msg: str) -> None:
        out.append(Finding("error", code, path, msg))

    def warn(code: str, path: str, msg: str) -> None:
        out.append(Finding("warning", code, path, msg))

    root = "message"
    contents = message
    if isinstance(message, dict) and message.get("type") == "flex":
        if not str(message.get("altText") or "").strip():
            err("C9", root, "altText がありません")
        elif len(message["altText"]) > 1500:
            warn("W1", root, "altText が1500文字を超えています（LINE仕様の上限）")
        contents = message.get("contents")
        root = "message.contents"
    if not isinstance(contents, dict):
        err("C1", root, "contents がありません")
        return out
    if contents.get("type") == "carousel":
        bubbles = contents.get("contents") or []
        bpath = f"{root}.contents"
    elif contents.get("type") == "bubble":
        bubbles, bpath = [contents], None
    else:
        err("C1", root, "carousel / bubble ではありません")
        return out

    # C1
    if not 1 <= len(bubbles) <= MAX_BUBBLES:
        err("C1", root, f"バブル数 {len(bubbles)}（1〜{MAX_BUBBLES} であること）")

    # C2 / C3 / C4 / C5 / C6 / C7
    for path, node in _walk(contents, root):
        if not isinstance(node, dict):
            continue
        for ck in COLOR_KEYS:
            if ck in node and _BLACK.match(str(node[ck])):
                err("C2", path, f"{ck} に真っ黒 {node[ck]} が使われています")
        t = node.get("type")
        if t in ("text", "button") and node.get("scaling") is not True:
            err("C6", path, f"{t} に scaling: true がありません")
        if t == "image":
            act = node.get("action") or {}
            if act.get("type") != "uri" or not str(act.get("uri", "")).startswith("https://"):
                err("C7", path, "image にタップで原寸を開く URI アクション（https）がありません")
        if t == "text":
            color = _norm(node.get("color"))
            if not color:
                err("C3", path, "text に color がありません（既定色は黒系のため禁止）")
                continue
            if color not in PALETTE:
                err("C3", path, f"text の色 {node.get('color')} は規定外です")
                continue
            exp = EXPECT[color]
            if not node.get("lineSpacing"):
                err("C4", path, f"{exp['name']}に lineSpacing がありません")
            elif exp["lineSpacing"] and node["lineSpacing"] != exp["lineSpacing"]:
                err("C4", path, f"{exp['name']}の lineSpacing は {exp['lineSpacing']}"
                                f"（実際 {node['lineSpacing']}）")
            weight = node.get("weight", "regular")
            if weight != exp["weight"]:
                err("C5", path, f"{exp['name']}の weight は {exp['weight']}（実際 {weight}）")
            size = node.get("size", "md")
            if exp["size"] and size not in exp["size"]:
                err("C5", path, f"{exp['name']}の size は {'/'.join(sorted(exp['size']))}"
                                f"（実際 {size}）")
            for i, sp in enumerate(node.get("contents") or []):
                spath = f"{path}.contents[{i}]"
                sc = _norm(sp.get("color")) or color
                if sc not in PALETTE:
                    err("C3", spath, f"span の色 {sp.get('color')} は規定外です")
                elif sc == KEY and sp.get("weight", weight) != "bold":
                    err("C5", spath, "重要数字（#111111）の span は bold にしてください")

    # C8 免責文
    if bubbles:
        last = bubbles[-1]
        lp = f"{bpath}[{len(bubbles) - 1}]" if bpath else root
        leaf = None
        for sect in ("footer", "body"):  # 見た目上の最後は footer があれば footer
            if isinstance(last.get(sect), dict):
                leaf = _last_leaf(last[sect])
                lp += f".{sect}"
                break
        if not isinstance(leaf, dict) or leaf.get("type") != "text":
            err("C8", lp, "最後のバブルの末尾が免責文（text）ではありません")
        elif disclaimer is not None and leaf.get("text", "").strip() != disclaimer.strip():
            err("C8", lp, "最後のバブルの末尾の文面が、渡された免責文と一致しません")

    size = len(json.dumps(contents, ensure_ascii=False).encode("utf-8"))
    if size > 50_000:
        warn("W1", root, f"contents が {size} バイト（LINEのカルーセル上限の目安 50KB を超過・要確認）")
    return out


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="朝刊わらしべ Flex 体裁チェッカー")
    ap.add_argument("message", help="Flex message の JSON ファイル")
    ap.add_argument("--disclaimer", help="免責文のテキストファイル（文面一致まで確認）")
    ap.add_argument("--json", action="store_true", help="結果を JSON で出す")
    a = ap.parse_args(argv)
    msg = json.loads(Path(a.message).read_text(encoding="utf-8"))
    disc = Path(a.disclaimer).read_text(encoding="utf-8") if a.disclaimer else None
    findings = lint(msg, disc)
    errors = [f for f in findings if f.level == "error"]
    if a.json:
        print(json.dumps({"ok": not errors, "findings": [asdict(f) for f in findings]},
                         ensure_ascii=False, indent=2))
    else:
        for f in findings:
            print(f"[{f.level}] {f.code} {f.path}: {f.message}")
        print("合格" if not errors else f"不合格（error {len(errors)} 件）")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
