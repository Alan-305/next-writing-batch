"""
Next Writing Batch の自由英作文（Essay proofreading）用プロンプト・出力分解。

- プロンプト: batch/next_prompts_for_batch.py（Nexus ベースの派生版）
- 分解ロジック: main.py の parse/finalize 系を Flask なしで最小コピー
"""

from __future__ import annotations

import os
import re
import sys
import json
from typing import Any, Dict, List, Optional, Tuple, cast

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from next_prompts_for_batch import ESSAY_PROMPT, ESSAY_PROMPT_MULTIPART  # noqa: E402

from task_problems import load_task_master  # noqa: E402

DEFAULT_QUESTION_FALLBACK = (
    "（提出データに課題文が含まれていません。英文のみを読み、"
    "自由英作文として採点・添削してください。）"
)

SECTION_JSON_INSTRUCTION = """

# 追加出力（必須・機械読取用）
- **完成版の英文の行・段落には `<<NEXUS_SECTION_JSON>>` や JSON を絶対に書かないこと。** 完成版を書き終えたら改行してから、次の3行だけを末尾に追加すること。
- **完成版の英文の先頭に `---` や区切り線を付けないこと。** 英文はそのまま書き始めること。
- 上記の通常出力をすべて出した後、最後に次の3行を必ず追加すること。
<<NEXUS_SECTION_JSON>>
{"content_comment":"...","grammar_comment":"...","content_deduction":0,"grammar_deduction":0}
<<END_NEXUS_SECTION_JSON>>

# 本文には「全体コメント」「総評」を書かない（不要）
JSON より前の本文は **得点1行目 → 文法の●行 → 完成版英文** だけ。旧来の2行目総評は**書かない**。

# content_comment（内容の指摘）に集約するもの（この順・すべて必須）
1. **意図の言語化**（見出し「Step 1」や「●」は**書かない**）：先頭から**本文1段落**で、生徒の伝えたかった核心を「あなたは〜を伝えたかったのですね」の趣旨で述べる。
2. **①②③** それぞれ**独立した行**で見出し（例：`①設問の条件・趣旨を満たしているか`）、**2文以上**のよしあしはその次の行以降に続ける。**中黒「●」は content_comment 内では一切使わない**（番号①②③で十分）。
3. **【ヒント】** 見出し行を**必ず**入れ、その次行に**1段落**（答案に即した具体1点）。**【ヒント】の省略は禁止**。
4. **③は必ず文末（。）まで書き切る**。途中で途切れた文・空白だけの行で終わらせない。出力上限に達しそうなときは①②をやや短くしてもよいが、**③と【ヒント】を優先して完結させる**。
5. 内容で減点した観点には、該当箇所の文末に**必ず** `（➖5点）` を付ける（同一観点で重複減点しない。減点なしなら付けない）。
内容面で改善提案をした場合、その提案は完成版英文に必ず反映すること。

- **配置の厳守**：意図の言語化・①②③・【ヒント】は**すべて content_comment のみ**。本文の●行（JSON より前）は**文法専用**。
- content_comment では**よしあし**をはっきり述べる（冠詞・綴り・時制・一致・語順・前置詞・品詞・接続の誤りなど**形・用法の指摘は絶対に書かない**）。内容で減点した観点の文末には `（➖5点）` を明記する。
- **【ヒント】**を1行の見出しとし、その次行に Step3 の具体を書くこと。
- **良い場合**：各観点について具体的に認め、**「とても素晴らしいです」レベルの力強い称賛**を交えて前向きに伝える（空疎な一言だけにしない）。
- **改善が必要な場合**：どこがどう問題かを明示し、**どう書き換えればよいか**をコンパクトに提案する。提案は**完成版の英文に必ず反映**する（内容の指摘だけで終わらせない）。
- 実務上、設問に沿って書けている答案では**大きな内容の問題は少ない**ことが多い。その場合も上記観点を踏まえて**よしあし**を述べ、内容の欠点を無理に作らない。**細かい誤りの大半は grammar_comment に集約**すること。
- grammar_comment には「文法・語法・構文・綴り・冠詞・一致・前置詞・コロケーション」など**形と用法の指摘**だけを書く（設問の読み落としや論旨の破綻は書かない）。本文の解説●行と同じ内容を繰り返してよい（機械が文法ブロックとして確実に読むため）。
- content_comment は改行の直後に句読点（、。など）だけが来ないようにする（句読点は必ず前行の末尾に付ける）。
- grammar_comment は文法・語法・表現の指摘をそれぞれ箇条書きにし、各項目の行頭は必ず「● 」（中黒＋半角スペース）から始める。**各行の末尾に（➖X点）を必ず付ける**（本文の●行と同一・省略禁止。X は整数。同一誤りの再出は（➖0点）可）。
- 指摘中に英文を書くときは、日本語のカギ括弧「」で囲まない（そのまま英語を書く）。
- content_deduction は **25 −（1行目の内容得点X）** と一致する整数（満点25の減点合計）。grammar_deduction は **25 −（1行目の文法得点Y）** と一致する整数。内容・文法に減点が無いときは 0。
- JSON の数値は必ず1行目の【内容X点＋文法Y点】と整合させること。
- **content_comment は空文字にしてはならない。** キー名は必ず `content_comment`（スネークケース）と `grammar_comment` を使う（camelCase 禁止）。
- JSON は必ず有効な JSON とし、文字列値内の改行は `\\n` でエスケープする（生改行で JSON を壊さない）。
- JSON を閉じる前に自己確認：（1）`content_comment` に「●」が含まれていない（2）③が句点で終わっている（3）**【ヒント】**見出しとその次の段落がある（4）`content_comment` の文字列が途中で切れていない。
- **禁止**：content_comment を「総評や得点を参照してください」「チェックリストで確認」などの**誘導だけ**にすること。①②③はそれぞれ**この答案について具体的**によしあしを**2文以上**で書くこと（観点名だけ並べない）。
- **【ヒント】**は**この答案の英文・設問に即した**、次回に効く**1つの**具体的な書き方・考え方のコツにすること（汎用の最終確認・チェックリスト化だけの文は禁止）。
"""


def build_nl_essay_prompt(*, question: str, user_answer: str, multipart: bool = False) -> str:
    q = (question or "").strip() or DEFAULT_QUESTION_FALLBACK
    ans = user_answer.strip()
    if multipart:
        base = ESSAY_PROMPT_MULTIPART.format(question=q, user_answer=ans)
    else:
        base = ESSAY_PROMPT.format(question=q, user_answer=ans)
    return f"{base.rstrip()}\n{SECTION_JSON_INSTRUCTION}"


def _clean_comment_line(line: str) -> str:
    t = line.strip()
    if not t:
        return ""
    if t.startswith("●"):
        return t
    t = re.sub(r"^[\-\*+•・]\s*", "", t)
    while t and (t.startswith("*") or t.startswith("＊")):
        t = t[1:].lstrip()
    return t.strip()


def _clean_comment_text(comment: str) -> str:
    if not comment:
        return comment
    lines = [_clean_comment_line(l) for l in comment.splitlines()]
    return "\n".join(l for l in lines if l)


def _strip_triple_quotes(s: str) -> str:
    if not s:
        return s
    t = s.strip()
    if len(t) >= 6 and t.startswith('"""') and t.endswith('"""'):
        return t[3:-3].strip()
    if len(t) >= 6 and t.startswith("'''") and t.endswith("'''"):
        return t[3:-3].strip()
    return t


def count_english_words(text: str) -> int:
    if not text or not str(text).strip():
        return 0
    t = str(text).replace("```", "")
    t = t.replace("-", " ")
    words = re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", t)
    return len(words)


def _strip_word_count_markers_anywhere(s: str) -> str:
    if not s:
        return s
    t = s
    while True:
        n = re.sub(
            r"\s*[\(（]\s*\d+\s*(?:語|words?)\s*[\)）]",
            "",
            t,
            flags=re.IGNORECASE,
        )
        if n == t:
            break
        t = n
    return t.strip()


def _normalize_final_version_text(s: str) -> str:
    if not s:
        return s
    t = s.strip()
    _fence = re.compile(
        r"^`{3}\s*(?:[a-zA-Z0-9_-]+\s*\n)?(.*?)`{3}\s*$",
        re.DOTALL,
    )
    for _ in range(4):
        m = _fence.match(t)
        if not m:
            break
        t = m.group(1).strip()
    return _strip_triple_quotes(t)


def strip_nexus_section_json_marker(s: str) -> str:
    """モデルが完成版末尾に JSON マーカーを連結したときの保険（改行なし・END 省略にも対応）。"""
    if not s:
        return s
    mark = "<<NEXUS_SECTION_JSON>>"
    i = s.find(mark)
    if i == -1:
        return s
    return s[:i].rstrip()


_RULE_DASH_HEAD = re.compile(r"^-{3,}\s*")


def strip_leading_rule_dashes(s: str) -> str:
    """完成版・英文ブロック文頭の `---`（区切り線風）を繰り返し除去。"""
    if not s:
        return s
    t = s.lstrip("\n\r \t\u3000\uFEFF")
    while True:
        m = _RULE_DASH_HEAD.match(t)
        if not m:
            break
        t = t[m.end() :].lstrip("\n\r \t\u3000\uFEFF")
    return t


def strip_final_essay_artifacts(s: str) -> str:
    """文頭 `---` と末尾 `<<NEXUS_SECTION_JSON>>` 以降をまとめて除去。"""
    return strip_nexus_section_json_marker(strip_leading_rule_dashes(s))


def finalize_final_version_for_display(s: str, append_word_count: bool = True) -> str:
    if not s:
        return s
    base = _strip_word_count_markers_anywhere(_normalize_final_version_text(s))
    base = strip_final_essay_artifacts(base)
    if not append_word_count:
        return base
    n = count_english_words(base)
    if n <= 0:
        return base
    return f"{base.rstrip()} ({n} words)"


_NEXUS_JSON_BEGIN = "<<NEXUS_SECTION_JSON>>"
_NEXUS_JSON_END = "<<END_NEXUS_SECTION_JSON>>"


def _split_at_nexus_markers(s: str) -> Tuple[str, str]:
    """
    マーカー前を本文、マーカー後〜END までを JSON 領域として分離。
    マーカー表記ゆれ（大文字小文字・END 省略）に対応。見つからなければ (s.strip(), "").
    """
    raw = s or ""
    low = raw.lower()
    begin_pat = "<<nexus_section_json>>"
    i = low.find(begin_pat)
    if i < 0:
        return raw.strip(), ""
    after = raw[i + len(begin_pat) :].lstrip()
    end_low = "<<end_nexus_section_json>>"
    j = after.lower().find(end_low)
    if j >= 0:
        region = after[:j].strip()
    else:
        region = after.strip()
    head = raw[:i].rstrip()
    return head, region


def _extract_json_string_value_for_key(blob: str, key: str) -> str:
    """
    `json.loads` が失敗しても、`"key": "..."` の値を JSON 文字列のエスケープ規則で抽出する。
    """
    if not blob or not key:
        return ""
    pat = re.compile(rf'"{re.escape(key)}"\s*:\s*"', re.MULTILINE | re.DOTALL)
    m = pat.search(blob)
    if not m:
        return ""
    j = m.end()
    out: List[str] = []
    while j < len(blob):
        c = blob[j]
        if c == "\\":
            j += 1
            if j >= len(blob):
                break
            esc = blob[j]
            if esc == "n":
                out.append("\n")
            elif esc == "r":
                out.append("\r")
            elif esc == "t":
                out.append("\t")
            elif esc in '"\\/':
                out.append(esc)
            elif esc == "u" and j + 4 < len(blob):
                hx = blob[j + 1 : j + 5]
                try:
                    out.append(chr(int(hx, 16)))
                except ValueError:
                    out.append("u")
                    for ch in hx:
                        out.append(ch)
                j += 4
            else:
                out.append(esc)
            j += 1
            continue
        if c == '"':
            return "".join(out)
        out.append(c)
        j += 1
    return "".join(out)


def _salvage_int_after_key(blob: str, key: str) -> Optional[int]:
    m = re.search(rf'"{re.escape(key)}"\s*:\s*(-?\d+)', blob)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _salvage_section_dict_from_blob(blob: str) -> Dict[str, Any]:
    """マーカー後テキストまたは生ログから content_comment / grammar_comment を救済。"""
    if not (blob or "").strip():
        return {}
    cc = _extract_json_string_value_for_key(blob, "content_comment")
    gc = _extract_json_string_value_for_key(blob, "grammar_comment")
    out: Dict[str, Any] = {}
    if cc.strip():
        out["content_comment"] = cc.strip()
    if gc.strip():
        out["grammar_comment"] = gc.strip()
    cd = _salvage_int_after_key(blob, "content_deduction")
    gd = _salvage_int_after_key(blob, "grammar_deduction")
    if cd is not None:
        out["content_deduction"] = cd
    if gd is not None:
        out["grammar_deduction"] = gd
    return out


def _trim_body_if_trailing_json(head: str, blob_hint: str) -> str:
    """本文末尾に JSON が付いた場合、先頭の `{` より前だけを本文とする。"""
    h = (head or "").strip()
    if not h:
        return h
    if '"content_comment"' not in blob_hint and '"content_comment"' not in h[-4000:]:
        return h
    cpos = h.rfind('"content_comment"')
    if cpos < 0:
        return h
    b0 = h.rfind("{", 0, cpos)
    if b0 < 0:
        return h
    return h[:b0].rstrip()


def _non_empty_str(v: Any) -> bool:
    return isinstance(v, str) and bool(v.strip())


def _strip_outer_markdown_json_fence(s: str) -> str:
    """モデルが ```json ... ``` で囲んだとき外側だけ除去。"""
    t = (s or "").strip()
    if not t.startswith("```"):
        return t
    t = re.sub(r"^```(?:json|JSON)?\s*", "", t)
    if t.rstrip().endswith("```"):
        t = t.rstrip()[:-3].rstrip()
    return t


def _slice_from_first_object_brace(s: str) -> str:
    """説明文のあとに `{` が来るまで読み飛ばす。"""
    t = (s or "").lstrip()
    i = t.find("{")
    return t[i:] if i >= 0 else t


def _coerce_section_json_dict(d: Dict[str, Any]) -> Dict[str, Any]:
    """API が camelCase や別名で返したとき content_comment / grammar_comment に寄せる。"""
    if not d:
        return {}
    o: Dict[str, Any] = dict(d)
    if not _non_empty_str(o.get("content_comment")):
        for k in ("contentComment", "ContentComment", "content_notes", "contentNotes", "内容の指摘"):
            if _non_empty_str(o.get(k)):
                o["content_comment"] = str(o.get(k) or "").strip()
                break
    if not _non_empty_str(o.get("grammar_comment")):
        for k in ("grammarComment", "GrammarComment", "grammar_notes", "grammarNotes", "文法の指摘"):
            if _non_empty_str(o.get(k)):
                o["grammar_comment"] = str(o.get(k) or "").strip()
                break
    for key, aliases in (
        ("content_deduction", ("contentDeduction", "ContentDeduction")),
        ("grammar_deduction", ("grammarDeduction", "GrammarDeduction")),
    ):
        if o.get(key) is None or (isinstance(o.get(key), str) and not str(o.get(key)).strip()):
            for ak in aliases:
                if o.get(ak) is not None and str(o.get(ak)).strip() != "":
                    o[key] = o[ak]
                    break
    return o


def _deductions_from_evaluation_scores(evaluation: str) -> Optional[Tuple[int, int]]:
    """1行目【内容X点＋文法Y点】から減点（満点25）を算出。パターン不一致時は None。"""
    parsed = _parse_content_grammar_from_ai_evaluation(evaluation)
    if not parsed:
        return None
    ca, ga = parsed
    return (max(0, min(25, 25 - ca)), max(0, min(25, 25 - ga)))


def _is_degenerate_content_comment(text: str) -> bool:
    """誘導文だけの content_comment を検出し、総評からの復元を試みる。"""
    t = (text or "").strip()
    if not t:
        return True
    # 以前の汎用フォールバストや同種の「参照へ誘導」だけの文は常に無効扱い
    force_junk = (
        "このページ上部",
        "ページ上部の得点",
        "チェックリスト化",
        "得点（1行目相当）",
        "全体コメント（総評）",
        "および完成版英文に反映しています",
    )
    # 長い正当な content_comment に誘導フレーズが紛れ込んでも捨てない（短文ボイラープレートのみ無効化）
    if len(t) <= 220 and any(m in t for m in force_junk):
        return True
    has_axis = ("①" in t) or ("\u2460" in t)
    junk_markers = ("参照してください", "1行目相当")
    if not has_axis and any(m in t for m in junk_markers):
        return True
    return False


def _split_general_at_first_circled_content(general_comment: str) -> Tuple[str, str]:
    """
    総評（2行目相当）に「…。①」のように内容が続いているとき、Step1 だけを総評に残す。
    戻り値: (残す総評, 内容の指摘として使う全文)
    """
    g = (general_comment or "").strip()
    if not g:
        return "", ""
    for circled in ("①", "\u2460"):
        i = g.find(circled)
        if i >= 12 and len(g) - i >= 20:
            head = g[:i].rstrip()
            tail = g[i:].lstrip()
            if tail:
                return head, tail
    m = re.search(r"[。．]\s*(?:①|\u2460)", g)
    if m and m.start() >= 8:
        head = g[: m.start() + 1].rstrip()
        tail = g[m.end() - 1 :].lstrip()
        if len(tail) >= 15:
            return head, tail
    return g, ""


def _looks_like_grammar_bullet_block(text: str) -> bool:
    """● 誤り → 正：… 形式の文法一覧か（粗い判定）。"""
    t = (text or "").strip()
    if not t:
        return False
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    if not lines:
        return False
    bullet_lines = [ln for ln in lines if ln.startswith("●") or ln.startswith("○")]
    if not bullet_lines:
        return False
    arrow_hits = sum(1 for ln in bullet_lines if "→" in ln or "➡" in ln)
    return arrow_hits >= max(1, len(bullet_lines) // 2)


def _infer_content_comment_from_general(general_comment: str) -> Tuple[str, str]:
    """
    JSON の content_comment が空のとき、総評に誤って書かれた ①②③・ヒントを分離する。
    戻り値: (残す総評, 内容の指摘として使うテキスト)
    """
    g = (general_comment or "").strip()
    if not g:
        return "", ""
    split_at = -1
    for needle in (
        "\n\n①",
        "\n\n②",
        "\n\n③",
        "\n①",
        "\n②",
        "\n③",
        "\n\n【ヒント】",
        "\n【ヒント】",
        "\n\n● ①",
        "\n● ①",
    ):
        j = g.find(needle)
        if j >= 0 and (split_at < 0 or j < split_at):
            split_at = j
    if split_at >= 8:
        return g[:split_at].rstrip(), g[split_at:].lstrip()
    m = re.search(r"\n\s*([\u2460-\u2473])", g)
    if m and m.start() >= 8:
        return g[: m.start()].rstrip(), g[m.start() :].lstrip()
    paras = [p.strip() for p in re.split(r"\n\s*\n", g) if p.strip()]
    if len(paras) >= 2:
        rest = "\n\n".join(paras[1:])
        if any(
            x in rest
            for x in ("①", "②", "③", "【ヒント】", "設問", "趣旨", "論理的整合", "論旨")
        ) or re.search(r"[\u2460-\u2473]", rest):
            return paras[0], rest
        if len(paras[0]) <= 240 and len(rest) >= 160:
            return paras[0], rest
    return g, ""


def _extract_first_balanced_json_object(s: str) -> Optional[str]:
    """先頭の空白のあとに `{` があるとき、対応する `}` までを返す（文字列内の括弧は無視）。"""
    t = (s or "").lstrip()
    if not t.startswith("{"):
        return None
    depth = 0
    in_str = False
    esc = False
    quote_ch = ""
    for i, ch in enumerate(t):
        if in_str:
            if esc:
                esc = False
                continue
            if ch == "\\":
                esc = True
                continue
            if ch == quote_ch:
                in_str = False
            continue
        if ch == '"':
            in_str = True
            quote_ch = '"'
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return t[: i + 1]
    return None


def _extract_section_json(raw_result: str) -> Tuple[str, Dict[str, Any]]:
    """
    `<<NEXUS_SECTION_JSON>>` 以降を本文から切り離し、可能なら JSON を dict にする。
    旧実装は末尾一致・非貪欲 `{.*?}` のため、同一行連結・END 省略・長い JSON で失敗しやすかった。
    """
    s = raw_result or ""
    head, json_region = _split_at_nexus_markers(s)
    parsed: Dict[str, Any] = {}
    if not json_region.strip():
        tail_probe = (s or "")[-24000:]
        salv0 = _salvage_section_dict_from_blob(tail_probe)
        if _non_empty_str(salv0.get("content_comment")):
            parsed = _coerce_section_json_dict(cast(Dict[str, Any], salv0))
            head = _trim_body_if_trailing_json(s.strip(), tail_probe)
        return head.strip(), parsed

    json_region = _strip_outer_markdown_json_fence(json_region)
    json_region = _slice_from_first_object_brace(json_region)
    json_raw = _extract_first_balanced_json_object(json_region)
    if json_raw:
        try:
            o = json.loads(json_raw)
            if isinstance(o, dict):
                parsed = _coerce_section_json_dict(cast(Dict[str, Any], o))
        except Exception:
            pass
    if not _non_empty_str(parsed.get("content_comment")) or not _non_empty_str(
        parsed.get("grammar_comment")
    ):
        salv = _salvage_section_dict_from_blob(json_region)
        if salv:
            merged = dict(parsed)
            if not _non_empty_str(merged.get("content_comment")) and _non_empty_str(
                salv.get("content_comment")
            ):
                merged["content_comment"] = str(salv.get("content_comment") or "").strip()
            if not _non_empty_str(merged.get("grammar_comment")) and _non_empty_str(
                salv.get("grammar_comment")
            ):
                merged["grammar_comment"] = str(salv.get("grammar_comment") or "").strip()
            for k in ("content_deduction", "grammar_deduction"):
                if k in salv and salv[k] is not None and (
                    k not in merged or merged.get(k) is None
                ):
                    merged[k] = salv[k]
            parsed = _coerce_section_json_dict(cast(Dict[str, Any], merged))
    return head.strip(), parsed


_GRAMMAR_SECTION_HEAD_PY = "【文法・語法・表現】"
_CONTENT_SECTION_HEAD_PY = "【内容】"
_HINT_HEAD_PY = "【ヒント】"


def canonicalize_growth_hint_heading_explanation(text: str) -> str:
    """student-release.ts canonicalizeGrowthHintHeadingInExplanation と同一。"""
    if not text:
        return text

    def _one_line(line: str) -> str:
        s = re.sub(r"^(\s*)(?:●|○)\s*【成長ヒント】\s*", r"\1【ヒント】", line)
        s = re.sub(r"^(\s*)【成長ヒント】\s*", r"\1【ヒント】", s)
        s = re.sub(r"^(\s*)(?:●|○)\s*ヒント\s*$", r"\1【ヒント】", s)
        s = re.sub(r"^(\s*)(?:●|○)\s*ヒント([：:])", r"\1【ヒント】\2", s)
        tr = s.strip()
        if tr == "ヒント":
            return re.sub(r"^(\s*)ヒント\s*$", r"\1【ヒント】", s)
        if re.match(r"^(\s*)ヒント([：:])", s):
            return re.sub(r"^(\s*)ヒント([：:])", r"\1【ヒント】\2", s)
        return s

    return "\n".join(_one_line(ln) for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"))


def canonicalize_legacy_grammar_heading_explanation(text: str) -> str:
    if not text:
        return text
    return "\n".join(
        _GRAMMAR_SECTION_HEAD_PY if line.strip() == "【文法】" else line
        for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    )


def normalize_student_explanation_text(text: str) -> str:
    """
    next-writing-batch の student-release.ts normalizeStudentExplanation と同等。
    【内容】内の行頭句読点を前行へ寄せる。【内容】ブロックでは ● を付けない（①②③と【ヒント】で区切る）。
    【文法・語法・表現】の箇条書きには ● を付与する。
    """
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.split("\n")
    mode = "outer"
    out: List[str] = []

    def trimmed(s: str) -> str:
        return s.strip()

    def is_content_head(s: str) -> bool:
        return trimmed(s) == _CONTENT_SECTION_HEAD_PY

    def is_grammar_head(s: str) -> bool:
        t = trimmed(s)
        return t == _GRAMMAR_SECTION_HEAD_PY or t == "【文法】"

    def is_grammar_deduction_line(s: str) -> bool:
        return bool(re.match(r"^\s*文法減点\s*合計\s*[:：]", s))

    def is_content_deduction_line(s: str) -> bool:
        return bool(re.match(r"^\s*内容減点\s*合計\s*[:：]", s))

    def leads_jp_clause_punct(t: str) -> bool:
        return bool(t) and t[0] in "、。，．"

    def strip_content_leading_markers(core: str) -> str:
        t = core
        while True:
            n = re.sub(r"^(?:●|○)\s*", "", t)
            if n == t:
                break
            t = n
        t = re.sub(r"(?i)^step\s*1\s*[：:．.]?\s*", "", t)
        return t

    for line in lines:
        if mode == "outer":
            if is_content_head(line):
                mode = "content_body"
            elif is_grammar_head(line):
                mode = "grammar_body"
            out.append(line)
            continue
        if mode == "content_body":
            if is_grammar_head(line):
                mode = "grammar_body"
                out.append(line)
                continue
            t0 = line.lstrip(" \t")
            if t0 and leads_jp_clause_punct(t0) and out:
                last = out[-1]
                last_trim = trimmed(last)
                if (
                    last_trim
                    and last_trim != _CONTENT_SECTION_HEAD_PY
                    and not is_content_deduction_line(last)
                    and not is_grammar_head(last)
                ):
                    out[-1] = last + t0
                else:
                    out.append(line)
                continue
            t = trimmed(line)
            if not t:
                out.append(line)
                continue
            if is_content_deduction_line(line):
                out.append(line)
                continue
            stripped_bullet = strip_content_leading_markers(t)
            indent_m = re.match(r"^\s*", line)
            indent = indent_m.group(0) if indent_m else ""
            if re.match(r"^[\u2460-\u2473]", stripped_bullet):
                out.append(indent + stripped_bullet)
                continue
            if stripped_bullet == _HINT_HEAD_PY or stripped_bullet.startswith(_HINT_HEAD_PY):
                out.append(indent + stripped_bullet)
                continue
            if t == "（記載なし）":
                out.append(line)
                continue
            out.append(indent + stripped_bullet if stripped_bullet else line)
            continue
        if is_grammar_deduction_line(line):
            mode = "outer"
            out.append(line)
            continue
        t = trimmed(line)
        if not t:
            out.append(line)
            continue
        if t.startswith("●") or t.startswith("○"):
            out.append(line)
            continue
        if is_content_deduction_line(line) or is_grammar_deduction_line(line):
            out.append(line)
            continue
        if t == "（記載なし）":
            out.append(line)
            continue
        out.append(f"● {t}")
    return "\n".join(out)


def _normalize_ai_content_comment_block(text: str) -> str:
    """JSON の content_comment 専用: 行頭句読点を前行末へ寄せ、●・Step 1 ラベルを除去（●は付けない）。"""
    if not (text or "").strip():
        return text
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    merged: List[str] = []
    for line in lines:
        t0 = line.lstrip(" \t")
        if t0 and t0[0] in "、。，．" and merged:
            last = merged[-1]
            if last.strip() and not re.match(r"^\s*内容減点\s*合計\s*[:：]", last):
                merged[-1] = last + t0
                continue
        merged.append(line)
    out: List[str] = []
    for line in merged:
        t = line.strip()
        if not t:
            out.append(line)
            continue
        if re.match(r"^\s*内容減点\s*合計\s*[:：]", line):
            out.append(line)
            continue
        stripped_bullet = t
        while True:
            n = re.sub(r"^(?:●|○)\s*", "", stripped_bullet)
            if n == stripped_bullet:
                break
            stripped_bullet = n
        stripped_bullet = re.sub(r"(?i)^step\s*1\s*[：:．.]?\s*", "", stripped_bullet)
        indent_m = re.match(r"^\s*", line)
        indent = indent_m.group(0) if indent_m else ""
        if re.match(r"^[\u2460-\u2473]", stripped_bullet):
            out.append(indent + stripped_bullet)
            continue
        if stripped_bullet == _HINT_HEAD_PY or stripped_bullet.startswith(_HINT_HEAD_PY):
            out.append(indent + stripped_bullet)
            continue
        out.append(indent + stripped_bullet)
    return "\n".join(out)


def _normalize_ai_grammar_comment_block(text: str) -> str:
    """JSON の grammar_comment 専用: 各行を ● 始まりに（減点合計行は除外しないが通常無い）。"""
    if not (text or "").strip():
        return text
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: List[str] = []
    for line in lines:
        t = line.strip()
        if not t:
            out.append(line)
            continue
        if re.match(r"^(文法|内容)減点\s*合計\s*[:：]", t):
            out.append(line)
            continue
        if t.startswith("●") or t.startswith("○"):
            out.append(line)
            continue
        out.append(f"● {t}")
    return "\n".join(out)


_SENTENCE_PARA_BREAK = re.compile(r"([.!?])\s+([A-Z][a-z])")


def _apply_sentence_paragraph_breaks(block: str) -> str:
    """長い1段落英文を文末＋次文の大文字で粗く段落分け（完成版の可読性用）。"""
    b = (block or "").strip()
    if not b or len(b) < 140:
        return b
    if "\n\n" in b:
        return b
    return _SENTENCE_PARA_BREAK.sub(r"\1\n\n\2", b)


def polish_final_essay_paragraphs(text: str, *, multipart: bool = False) -> str:
    """完成版を意味の区切りで空行入りに整える（プロンプト遵守の後処理）。"""
    t = (text or "").strip()
    if not t:
        return t
    base = _strip_word_count_markers_anywhere(_normalize_final_version_text(t))
    base = strip_final_essay_artifacts(base)
    if not base.strip():
        return t
    if multipart:
        segs = re.split(r"(?=\(\d+\)\s)", base)
        parts_out: List[str] = []
        for seg in segs:
            seg = seg.strip()
            if not seg:
                continue
            m = re.match(r"^(\(\d+\)\s*)([\s\S]*)$", seg)
            if m:
                head, body = m.group(1), (m.group(2) or "").strip()
                inner = _apply_sentence_paragraph_breaks(body) if body else ""
                parts_out.append((head + inner).strip())
            else:
                parts_out.append(_apply_sentence_paragraph_breaks(seg))
        out = "\n\n".join(parts_out)
    else:
        out = _apply_sentence_paragraph_breaks(base)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _grammar_block_has_deduction_marks(text: str) -> bool:
    """（➖2点）（-1点）等の減点表記が1つ以上あるか（本文●行と JSON grammar_comment の優先判定用）。"""
    if not (text or "").strip():
        return False
    t = _normalize_explanation_deduction_marks(text)
    return bool(re.search(r"（\s*-?\s*\d+\s*点\s*）", t))


def grammar_body_from_merged_explanation(explanation: str) -> Optional[str]:
    """
    merge_proofread_explanation_for_storage 後の全文から、【文法】見出しの次行〜
    「文法減点 合計」行の直前までを取り出す（realign 済みの箇条書きと一致させる用）。
    """
    s = (explanation or "").replace("\r\n", "\n").replace("\r", "\n")
    if not s.strip():
        return None
    for head in (_GRAMMAR_SECTION_HEAD_PY, "【文法】"):
        hi = s.find(head)
        if hi < 0:
            continue
        tail = s[hi + len(head) :].lstrip("\n")
        out_lines: List[str] = []
        for ln in tail.split("\n"):
            if re.match(r"^\s*文法減点\s*合計\s*[:：]", ln):
                break
            out_lines.append(ln)
        return "\n".join(out_lines).strip()
    return None


def merge_proofread_explanation_for_storage(
    *,
    body_explanation: str,
    content_comment: str,
    grammar_comment: str,
    content_deduction: int,
    grammar_deduction: int,
    content_max: int = 25,
    grammar_max: int = 25,
) -> str:
    """
    本文から取った文法●行・JSON の content/grammar を、生徒画面・PDF と同型の
    【内容】…内容減点 / 【文法・語法・表現】…文法減点 にまとめる。
    """
    c = (content_comment or "").strip()
    g_json = (grammar_comment or "").strip()
    g_body = (body_explanation or "").strip()
    # JSON の grammar_comment が空でなくても、減点（➖N点）を落として短く書かれることがある。
    # 本文の●行にだけ（➖N点）があるときは本文を優先する。
    if g_json and g_body:
        g = g_body if _grammar_block_has_deduction_marks(g_body) and not _grammar_block_has_deduction_marks(
            g_json
        ) else g_json
    else:
        g = g_json or g_body
    cd = max(0, int(content_deduction))
    gd = max(0, int(grammar_deduction))
    cs = max(0, content_max - cd)
    gs = max(0, grammar_max - gd)
    lines: List[str] = []
    lines.append(_CONTENT_SECTION_HEAD_PY)
    lines.append(c if c else "（記載なし）")
    lines.append(f"内容減点 合計: -{cd}点（{cs}/{content_max}点）")
    lines.append("")
    lines.append(_GRAMMAR_SECTION_HEAD_PY)
    lines.append(g if g else "（記載なし）")
    lines.append(f"文法減点 合計: -{gd}点（{gs}/{grammar_max}点）")
    raw = "\n".join(lines).strip()
    raw = realign_grammar_deduction_marks_in_merged_explanation(raw, grammar_deduction=gd)
    return normalize_student_explanation_text(raw)


def parse_free_writing_feedback(raw_result: str) -> Tuple[str, str, str, str, str, str, int, int]:
    """
    ESSAY_PROMPT の生テキスト出力を分解する。
    戻り値: evaluation, general_comment, explanation, final_version, content_comment, grammar_comment, …
    総評が本文に残っていれば content_comment に統合し、general_comment は空にする。
    """
    raw_full = raw_result or ""
    raw_result = raw_result.replace("**", "").strip()
    raw_result, section_json = _extract_section_json(raw_result)
    if not raw_result:
        return "採点エラー", "", "", "", "", "", 0, 0
    if raw_result.startswith("採点エラーが発生しました"):
        return raw_result.strip(), "", "", "", "", "", 0, 0

    lines = raw_result.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    if not lines:
        return "採点エラー", "", "", "", "", "", 0, 0

    evaluation = lines[0].strip()
    if len(lines) == 1:
        return evaluation, "", "", "", "", "", 0, 0

    has_bullet = any(line.strip().startswith("●") for line in lines[1:])
    if has_bullet:
        idx = len(lines) - 1
        while idx >= 1:
            if lines[idx].strip().startswith("●"):
                break
            idx -= 1
        final_raw = "\n".join(lines[idx + 1 :]).strip()
        middle = lines[1 : idx + 1]
    else:
        final_raw = lines[-1].strip()
        middle = lines[1:-1]

    final_version = finalize_final_version_for_display(final_raw)

    general_parts: list[str] = []
    explanation_parts: list[str] = []
    seen_bullet = False
    for line in middle:
        stripped = line.strip()
        if not stripped:
            if not seen_bullet and general_parts:
                general_parts.append("")
            continue
        if stripped.startswith("●"):
            seen_bullet = True
        if seen_bullet:
            explanation_parts.append(stripped)
        else:
            general_parts.append(line.rstrip())

    general_comment = "\n".join(general_parts).strip()
    general_comment = re.sub(r"\n{3,}", "\n\n", general_comment)
    general_comment = _clean_comment_text(general_comment)

    explanation = "\n".join(explanation_parts).strip()

    if not explanation_parts and middle:
        full_mid = "\n".join(line.rstrip() for line in middle).strip()
        full_mid = _clean_comment_text(full_mid)
        paras = [p.strip() for p in re.split(r"\n\s*\n", full_mid) if p.strip()]
        if len(paras) >= 2:
            general_comment = paras[0]
            explanation = "\n\n".join(paras[1:])
        elif len(paras) == 1:
            general_comment = paras[0]
            explanation = ""
        else:
            general_comment = ""
            explanation = full_mid

    content_comment = _normalize_ai_content_comment_block(str(section_json.get("content_comment") or "").strip())
    if _is_degenerate_content_comment(content_comment):
        content_comment = ""
    grammar_comment = _normalize_ai_grammar_comment_block(str(section_json.get("grammar_comment") or "").strip())
    try:
        content_deduction = int(section_json.get("content_deduction", 0))
    except (TypeError, ValueError):
        content_deduction = 0
    try:
        grammar_deduction = int(section_json.get("grammar_deduction", 0))
    except (TypeError, ValueError):
        grammar_deduction = 0
    if content_deduction < 0:
        content_deduction = 0
    if grammar_deduction < 0:
        grammar_deduction = 0

    ev_ded = _deductions_from_evaluation_scores(evaluation)
    if ev_ded is not None:
        content_deduction, grammar_deduction = ev_ded

    if not (content_comment or "").strip():
        g_kept, inferred_c = _split_general_at_first_circled_content(general_comment)
        if (inferred_c or "").strip():
            general_comment = g_kept
            content_comment = _normalize_ai_content_comment_block(inferred_c.strip())

    if not (content_comment or "").strip():
        g_kept, inferred_c = _infer_content_comment_from_general(general_comment)
        if (inferred_c or "").strip():
            general_comment = g_kept
            content_comment = _normalize_ai_content_comment_block(inferred_c.strip())

    if not (content_comment or "").strip() and (explanation or "").strip():
        # 文法●を出さずに「3行目の内容解説」を解説欄にだけ書いた旧習慣 → grammar ブロックに流れてしまうのを防ぐ
        if not _looks_like_grammar_bullet_block(explanation):
            content_comment = _normalize_ai_content_comment_block(explanation.strip())
            explanation = ""

    # 本文に残った総評・全体コメントは内容の指摘へ統合し、general_comment は空にする
    if (general_comment or "").strip():
        gc = (content_comment or "").strip()
        gg = general_comment.strip()
        if gc:
            content_comment = _normalize_ai_content_comment_block(f"{gg}\n\n{gc}")
        else:
            content_comment = _normalize_ai_content_comment_block(gg)
        general_comment = ""

    if not (content_comment or "").strip():
        salv2 = _salvage_section_dict_from_blob(raw_full.replace("**", ""))
        if _non_empty_str(salv2.get("content_comment")):
            content_comment = _normalize_ai_content_comment_block(
                str(salv2.get("content_comment") or "").strip()
            )

    if not (content_comment or "").strip():
        content_comment = (
            "モデル出力から内容の指摘（JSON の content_comment）を読み取れませんでした。"
            "ネットワークや出力形式の問題の可能性があります。再実行するか、運用画面で内容を手入力してください。\n"
            "①設問の趣旨・条件 ②的確な応答 ③論理的整合性 および【ヒント】は、完成版英文と文法の●行を参照し、ここに追記するとよいでしょう。"
        )

    return (
        evaluation,
        general_comment,
        explanation,
        final_version,
        content_comment,
        grammar_comment,
        content_deduction,
        grammar_deduction,
    )


def read_aloud_english_from_proofread(pr: Dict[str, Any]) -> str:
    """TTS 用: final_essay があればそれ。なければ final_version から語数表記を除いた英文。"""
    fe = str(pr.get("final_essay") or "").strip()
    if fe:
        return fe
    fv = str(pr.get("final_version") or "").strip()
    if fv:
        return finalize_final_version_for_display(fv, append_word_count=False)
    return ""


def _parse_content_grammar_from_ai_evaluation(eval_text: str) -> Optional[Tuple[int, int]]:
    """「内容22点＋文法14点 … /50点」形式から AI の内容・文法点を取り出す。"""
    t = (eval_text or "").strip()
    if not t:
        return None
    m = re.search(r"内容\s*(\d+)\s*点\s*[＋+]\s*文法(?:・語法)?\s*(\d+)\s*点", t)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _denominator_from_ai_evaluation(eval_text: str) -> Optional[int]:
    m = re.search(r"/\s*(\d+)\s*点", eval_text or "")
    if not m:
        return None
    return int(m.group(1))


def _normalize_explanation_deduction_marks(s: str) -> str:
    """（➖3点）などを ASCII ハイフンにそろえ、減点の抽出・整合に使う。"""
    if not s:
        return s
    t = s
    for u in (
        "\u2796",
        "\u2212",
        "\uff0d",
        "\u2012",
        "\u2013",
        "\u2014",
        "➖",
        "－",
    ):
        t = t.replace(u, "-")
    t = re.sub(r"（\s*-\s*", "（-", t)
    t = re.sub(r"\(\s*-\s*", "(-", t)
    return t


def _sum_deduction_points_from_explanation(text: str) -> int:
    """解説内の （-N点） / （➖N点） などの減点を合算（正の整数のみ）。"""
    t = _normalize_explanation_deduction_marks(text or "")
    if not t.strip():
        return 0
    pat = re.compile(r"（\s*-?\s*(\d+)\s*点\s*）")
    return sum(int(m.group(1)) for m in pat.finditer(t))


def _infer_pdf_rubric_scores_from_ai(
    eval_text: str,
    items: List[Tuple[str, str, int]],
) -> Optional[Dict[str, int]]:
    """
    AI evaluation からルーブリック各項目の得点を推定（満点にクランプ）。
    - 合計分母がルーブリック合計と一致 → AI の数値をそのまま採用
    - 分母 50（25+25 想定）→ 各項目の満点に比例換算
    """
    if len(items) > 2:
        return None
    parsed = _parse_content_grammar_from_ai_evaluation(eval_text)
    if not parsed or len(items) < 1:
        return None
    ca, ga = parsed
    den = _denominator_from_ai_evaluation(eval_text)
    if den is None:
        den = 50
    caps = [mx for _, _, mx in items]
    pair_sum = sum(caps)
    out: Dict[str, int] = {}
    if len(items) == 1:
        iid, _, mx = items[0]
        if den == pair_sum:
            v = min(max(ca, 0), mx)
        elif den == 50:
            v = int(round(ca * mx / 25.0))
            v = min(max(v, 0), mx)
        else:
            return None
        out[iid] = v
        return out
    id0, _, m0 = items[0]
    id1, _, m1 = items[1]
    if den == pair_sum:
        out[id0] = min(max(ca, 0), m0)
        out[id1] = min(max(ga, 0), m1)
        return out
    if den == 50:
        out[id0] = min(max(int(round(ca * m0 / 25.0)), 0), m0)
        out[id1] = min(max(int(round(ga * m1 / 25.0)), 0), m1)
        return out
    return None


def _pdf_rubric_evaluation_from_release(project_root: str, submission: Dict[str, Any]) -> str:
    """
    PDF 用の得点ブロック。AI の evaluation 行が取れれば減点後の得点をルーブリックに換算、
    無ければ運用入力の scores を使用。
    """
    sr = submission.get("studentRelease") or {}
    scores_raw = sr.get("scores")
    if not isinstance(scores_raw, dict):
        scores_raw = {}
    task_id = str(submission.get("taskId") or "").strip()
    if not task_id:
        return ""
    master = load_task_master(project_root, task_id)
    if not master:
        return ""
    rub = master.get("rubric")
    if not isinstance(rub, dict):
        return ""
    items_raw = rub.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        return ""

    items: List[Tuple[str, str, int]] = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        iid = str(it.get("id") or "").strip()
        label = str(it.get("label") or "").strip() or iid
        mx = it.get("max")
        try:
            max_v = int(mx) if mx is not None and str(mx).strip() != "" else 0
        except (TypeError, ValueError):
            max_v = 0
        if not iid or max_v <= 0:
            continue
        items.append((iid, label, max_v))

    if not items:
        return ""

    pr = submission.get("proofread") or {}
    eval_ai = str(pr.get("evaluation") or "")
    inferred = _infer_pdf_rubric_scores_from_ai(eval_ai, items)
    has_release_scores = len(scores_raw) > 0

    if not inferred and not has_release_scores:
        return ""

    max_total_raw = rub.get("maxTotal")
    try:
        cap = int(max_total_raw) if max_total_raw is not None and int(max_total_raw) > 0 else 0
    except (TypeError, ValueError):
        cap = 0
    if cap <= 0:
        cap = sum(m for _, _, m in items)

    scores = cast(Dict[str, Any], scores_raw)
    vals: List[int] = []
    for iid, label, mx in items:
        if has_release_scores:
            raw = scores.get(iid)
            try:
                v = int(raw) if raw is not None and str(raw).strip() != "" else 0
            except (TypeError, ValueError):
                v = 0
            if v < 0:
                v = 0
            if v > mx:
                v = mx
        elif inferred and iid in inferred:
            v = inferred[iid]
        else:
            v = 0
        vals.append(min(max(v, 0), mx))

    exp_sr = str(sr.get("explanation") or "")
    ded_sum = _sum_deduction_points_from_explanation(exp_sr)
    if ded_sum > 0 and cap > 0:
        target_total = max(0, min(cap, cap - ded_sum))
        s_pre = sum(vals)
        if s_pre > 0 and len(vals) == len(items):
            adj = _largest_remainder_ints([float(x) for x in vals], target_total)
            vals = [min(max(adj[i], 0), items[i][2]) for i in range(len(vals))]

    sum_v = sum(vals)
    total = min(sum_v, cap) if cap > 0 else sum_v

    # PDF 用 1 行: 内容X/Y点＋文法・語法X/Y点＝X/Y点
    segs: List[str] = []
    for (iid, label, mx), v in zip(items, vals):
        segs.append(f"{label}{v}/{mx}点")
    if not segs:
        return ""
    joined = "＋".join(segs)
    cap_s = f"{total}/{cap}点" if cap > 0 else f"{total}点"
    return f"{joined}＝{cap_s}"


def _total_loss_from_rubric_evaluation_block(line1: str) -> Optional[int]:
    """「…＝21/30点」または従来の「合計: 21/30点」から満点に対する減点合計を得る。"""
    t = line1 or ""
    m = re.search(r"＝\s*(\d+)/(\d+)点", t)
    if not m:
        m = re.search(r"合計:\s*(\d+)/(\d+)点", t)
    if not m:
        return None
    got, cap = int(m.group(1)), int(m.group(2))
    return max(0, cap - got)


def _largest_remainder_ints(weights: List[float], target: int) -> List[int]:
    """非負整数に分割し、合計がちょうど target になる（最大剰余法）。"""
    if not weights:
        return []
    if target <= 0:
        return [0] * len(weights)
    s = sum(weights)
    if s <= 0:
        return [0] * len(weights)
    raw = [w * target / s for w in weights]
    floors = [int(x) for x in raw]
    rem = [x - f for x, f in zip(raw, floors)]
    diff = target - sum(floors)
    order = sorted(range(len(rem)), key=lambda i: -rem[i])
    for k in range(diff):
        floors[order[k % len(order)]] += 1
    return floors


def align_explanation_deductions_to_total_loss(explanation: str, total_loss: int) -> str:
    """
    解説中の （N点） を、1) の表で示した合計減点と一致するよう振り直す。
    元の AI の相対比率は最大剰余法で保ちつめ、合計が total_loss になる。
    """
    explanation = _normalize_explanation_deduction_marks(explanation or "")
    if not explanation.strip():
        return explanation
    if total_loss < 0:
        return explanation
    pat = re.compile(r"（\s*-?\s*(\d+)\s*点\s*）")
    matches = list(pat.finditer(explanation))
    if not matches:
        return explanation
    vals = [int(m.group(1)) for m in matches]
    ssum = sum(vals)
    n = len(vals)
    if ssum == 0:
        if total_loss == 0:
            new_vals = [0] * n
        else:
            new_vals = _largest_remainder_ints([1.0] * n, total_loss)
    elif total_loss == 0:
        new_vals = [0] * n
    else:
        new_vals = _largest_remainder_ints([float(v) for v in vals], total_loss)
    parts: List[str] = []
    last = 0
    for m, nv in zip(matches, new_vals):
        parts.append(explanation[last : m.start()])
        parts.append(f"（-{nv}点）")
        last = m.end()
    parts.append(explanation[last:])
    return "".join(parts)


def realign_grammar_deduction_marks_in_merged_explanation(explanation: str, grammar_deduction: int) -> str:
    """
    【文法】ブロック内の各（➖N点）／（-N点）の合計が、1行目得点から出した grammar_deduction と一致するよう振り直す。
    JSON と本文●をつなぎ合わせたあと、フッター「文法減点 合計」と各行の合計が食い違わないようにする。
    """
    s = explanation or ""
    if not s.strip():
        return s
    gd = max(0, int(grammar_deduction))
    heads = (_GRAMMAR_SECTION_HEAD_PY, "【文法】")
    for head in heads:
        hi = s.find(head)
        if hi < 0:
            continue
        tail_from = s[hi:]
        ln_list = tail_from.split("\n")
        ded_i = -1
        for i, ln in enumerate(ln_list):
            if re.match(r"^\s*文法減点\s*合計\s*[:：]", ln):
                ded_i = i
                break
        if ded_i < 0:
            return s
        core = "\n".join(ln_list[:ded_i]).strip()
        rest = "\n".join(ln_list[ded_i:])
        aligned_core = align_explanation_deductions_to_total_loss(core, gd)
        return s[:hi] + aligned_core + "\n" + rest
    return s


def read_aloud_essay_for_day4(submission: Dict[str, Any]) -> str:
    """運用の finalText を優先（公開済み > 確定のみ > proofread）。"""
    sr = submission.get("studentRelease") or {}
    if str(sr.get("operatorApprovedAt") or "").strip():
        t = str(sr.get("finalText") or "").strip()
        if t:
            return t
    if str(sr.get("operatorFinalizedAt") or "").strip():
        t = str(sr.get("finalText") or "").strip()
        if t:
            return t
    return read_aloud_english_from_proofread(submission.get("proofread") or {})


def pdf_feedback_lines_for_day4(project_root: str, submission: Dict[str, Any]) -> Tuple[str, str, str]:
    """PDF の3ブロック。公開済み > 確定のみ > proofread。得点はルーブリック実点/満点で明示（確定・公開時）。"""
    sr = submission.get("studentRelease") or {}
    if str(sr.get("operatorApprovedAt") or "").strip():
        built = _pdf_rubric_evaluation_from_release(project_root, submission)
        ev = built if built else str(sr.get("evaluation") or "").strip()
        exp = str(sr.get("explanation") or "").strip()
        loss = _total_loss_from_rubric_evaluation_block(ev)
        if loss is not None and exp:
            exp = align_explanation_deductions_to_total_loss(exp, loss)
        exp = normalize_student_explanation_text(
            canonicalize_growth_hint_heading_explanation(
                canonicalize_legacy_grammar_heading_explanation(exp)
            )
        )
        return (
            ev,
            str(sr.get("generalComment") or "").strip(),
            exp,
        )
    if str(sr.get("operatorFinalizedAt") or "").strip():
        built = _pdf_rubric_evaluation_from_release(project_root, submission)
        ev = built if built else str(sr.get("evaluation") or "").strip()
        exp = str(sr.get("explanation") or "").strip()
        loss = _total_loss_from_rubric_evaluation_block(ev)
        if loss is not None and exp:
            exp = align_explanation_deductions_to_total_loss(exp, loss)
        exp = normalize_student_explanation_text(
            canonicalize_growth_hint_heading_explanation(
                canonicalize_legacy_grammar_heading_explanation(exp)
            )
        )
        return (
            ev,
            str(sr.get("generalComment") or "").strip(),
            exp,
        )
    pr = submission.get("proofread") or {}
    if (pr.get("evaluation") or "").strip():
        exp_pr = normalize_student_explanation_text(
            canonicalize_growth_hint_heading_explanation(
                canonicalize_legacy_grammar_heading_explanation(str(pr.get("explanation") or "").strip())
            )
        )
        return (
            str(pr.get("evaluation") or "").strip(),
            str(pr.get("general_comment") or "").strip(),
            exp_pr,
        )
    return (
        str(pr.get("line1_feedback") or "").strip(),
        str(pr.get("line2_improvement") or "").strip(),
        str(pr.get("line3_next_action") or "").strip(),
    )
