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

from next_prompts_for_batch import (  # noqa: E402
    COMPACT_FEEDBACK_LAYOUT_RULES,
    DISCOURSE_MARKER_RULES,
    ESSAY_PROMPT,
    ESSAY_PROMPT_MULTIPART,
    VETERAN_GRAMMAR_TEACHING_RULES,
)

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
{"content_comment":"...","grammar_comment":"...","polish_comment":"...","content_deduction":0,"grammar_deduction":0}
<<END_NEXUS_SECTION_JSON>>

# 本文には「全体コメント」「総評」を書かない（不要）
JSON より前の本文は **得点1行目 → 減点あり文法の●行 → 完成版英文** だけ。

# content_comment（【内容】）— コンパクト2区分のみ（厳守）
次の2見出し**のみ**（この順）。各見出しの下は `・` 箇条書き（各1行・簡潔）。**中黒「●」禁止**。
1. `①良い点` … 答案の良い点（最大4項目）
2. `②改善点` … 内容面で減点・改善が必要な点（最大4項目）。**各行末に `（-1点）` `（-2点）` 等**（その指摘に対応する内容減点）。**内容減点0点で十分合格なら** `・改善する必要は特にありません。素晴らしい出来です。` の1行のみ
**禁止**: `③減点箇所`、意図の言語化の長段落、【ヒント】、旧「①設問の条件…」形式、無理な欠点探し

# grammar_comment（【文法・語法・表現】）
- **減点あり（➖1点以上）の●行のみ**。`（➖0点）` や減点表記のない行は**絶対に入れない**（polish_comment へ）。
- **同一誤りを2行以上書かない**（than/rather than・in recent years+時制・more important than などは各1行）。
- than/rather than クラスターは**1行**にまとめ、① rather than 案 ② higher+than 案の両方を簡潔に示す。
- 各行: `● 誤り → 正：解説（➖X点）`（X≧1）。**減点合計行・見出しは書かない**。

# polish_comment（【完成版のポイント】）
- 完成版で**修正・追記した**表現（減点対象でないものも含む）。
- 各行: `・ 原文 → 完成版：理由`（**減点表記禁止**）。理由は必須。
- **禁止**: 見出し行、減点合計行、grammar と同じ指摘の繰り返し、`（該当なし）` を中身があるのに付けること

# 版面（厳格）
- 解説全体（3 JSON ブロック）は **A4 印刷2ページ以内**。冗長・重複禁止。
- content_deduction / grammar_deduction は1行目得点と整合。
- JSON 文字列内改行は `\\n` でエスケープ。
- 自己確認: grammar に➖0点無し / polish に減点表記無し / 完成版の変更が3ブロックでカバーされている / A4 2ページ以内

# 指摘と完成版の対応（厳守・最重要）
「指摘してから修正する」。完成版の変更は grammar_comment・content_comment（②）・polish_comment のいずれかに必ず含める。
原文と完成版が異なるとき、polish_comment には**修正・追記した箇所を箇条書き＋理由**で必ず書く（無言修正は禁止）。
"""

# VETERAN_GRAMMAR_TEACHING_RULES は next_prompts_for_batch.py で定義（than・時制・➖0点書き換え）

FINAL_VERSION_REFINEMENT_PROMPT = """あなたは受験英作文の添削担当です。
下書きの完成版英文を、内容の指摘（①良い点・②改善点）と文法修正一覧に**すべて忠実に反映**した完成版に書き直してください。

# 厳守
- 生徒が本当に言いたかった意図を失わない。設問条件（語数・必須要素）を満たす。
- **②改善点**で述べた内容面の改善は、完成版英文に**必ず実装**する。
- 文法修正一覧の「→ 正しい英語」は完成版に反映済みにする。
- 文法修正一覧・内容の指摘に**無い**新しい書き換えを完成版に加えないこと（必要なら先に指摘側へ追記してから反映する）。
- 英文のみ出力。日本語・解説・語数表記・JSON・見出しは書かない。
{multipart_note}

# 問題
{question}

# 生徒の原文
{original_essay}

# 下書き完成版（これを改善する）
{draft_final}

# 文法修正一覧（すべて反映）
{grammar_bullets}

# 内容の指摘（①良い点・②改善点）
{content_comment}
"""

FEEDBACK_COVERAGE_AUDIT_PROMPT = """あなたは受験英作文の超ベテラン講師です。
生徒の原文と完成版英文を比較し、**完成版で修正・追加・削除された箇所のうち、既存の指摘にまだ書かれていないもの**をすべて洗い出し、追記用テキストを出力してください。

# 厳守（ベテラン講師の原則）
- 「指摘してから修正する」。完成版に反映した変更は**すべて**指摘に含める。無言修正は禁止。
- 既存の文法●行・content_comment に**すでに**書いてある修正は**重複して書かない**（追記禁止）。
- **than / rather than / such as ... than / 原級＋than** は既存に1行でもあれば追記しない。
- **in recent years + 時制** も既存に1行でもあれば追記しない。
- **more important than** も既存に1行でもあれば追記しない。
- **than と比較級**: 追記が必要な場合も**1行にまとめ**、① rather than 案 ② higher+than 案を示す（複数行に分割禁止）。
- 形・用法・冠詞・語法・綴り・品詞・前置詞・コロケーション・表現の言い換え → `additional_grammar_bullets`（●行形式）
- 論旨の明確化・具体例の追加・結論の補強・語彙の内容面向上 → `content_comment_additions`（日本語。①②のどれかに触れる内容として書く）
- 軽微な文法誤りは（➖1点）、重要な誤りは（➖2点）。`additional_grammar_bullets` に（➖0点）や減点なし行は**絶対に書かない**。
- **減点対象でない書き換え・追記** → `additional_polish_bullets`（`・ 原文 → 完成版：理由` 形式。減点表記禁止。理由必須）
- 指摘に英文を書くときはカギ括弧「」で囲まない。
- 変更が既存指摘で十分カバーされている場合は両フィールドを空文字にする。

# 文法●行の形式（additional_grammar_bullets の各行）
● 誤りの英語（短いフレーズ） → 正しい英語（短いフレーズ）：日本語での解説（➖X点）

# 出力（この JSON のみ。前後に説明を書かない）
<<NEXUS_FEEDBACK_AUDIT_JSON>>
{{"additional_grammar_bullets":"","additional_polish_bullets":"","content_comment_additions":""}}
<<END_NEXUS_FEEDBACK_AUDIT_JSON>>

# 問題
{question}

# 生徒の原文
{original_essay}

# 完成版英文（確定版）
{final_essay}

# 既存の文法指摘（本文●行＋grammar_comment）
{existing_grammar}

# 既存の内容の指摘（content_comment）
{existing_content}

# 既存の完成版のポイント（polish_comment）
{existing_polish}
"""


def build_nl_essay_prompt(*, question: str, user_answer: str, multipart: bool = False) -> str:
    q = (question or "").strip() or DEFAULT_QUESTION_FALLBACK
    ans = user_answer.strip()
    if multipart:
        base = ESSAY_PROMPT_MULTIPART.format(question=q, user_answer=ans)
    else:
        base = ESSAY_PROMPT.format(question=q, user_answer=ans)
    return f"{base.rstrip()}\n{DISCOURSE_MARKER_RULES}\n{VETERAN_GRAMMAR_TEACHING_RULES}\n{COMPACT_FEEDBACK_LAYOUT_RULES}\n{SECTION_JSON_INSTRUCTION}"


def build_final_version_refinement_prompt(
    *,
    question: str,
    original_essay: str,
    draft_final: str,
    content_comment: str,
    grammar_bullets: str,
    multipart: bool = False,
) -> str:
    """内容の指摘・【ヒント】を完成版英文に反映させるための第2パス用プロンプト。"""
    q = (question or "").strip() or DEFAULT_QUESTION_FALLBACK
    multipart_note = (
        "- 複数設問の場合は (1)(2) ラベルを維持し、設問ブロックの間は空行1行とする。"
        if multipart
        else "- 意味のまとまりごとに空行で段落分けしてよい。"
    )
    return FINAL_VERSION_REFINEMENT_PROMPT.format(
        multipart_note=multipart_note,
        question=q,
        original_essay=(original_essay or "").strip(),
        draft_final=(draft_final or "").strip(),
        grammar_bullets=(grammar_bullets or "").strip() or "（文法修正なし）",
        content_comment=(content_comment or "").strip(),
    )


def build_feedback_coverage_audit_prompt(
    *,
    question: str,
    original_essay: str,
    final_essay: str,
    existing_grammar: str,
    existing_content: str,
    existing_polish: str = "",
) -> str:
    """完成版と原文の差分のうち、既存指摘に無い修正を洗い出す第3パス用プロンプト。"""
    q = (question or "").strip() or DEFAULT_QUESTION_FALLBACK
    return FEEDBACK_COVERAGE_AUDIT_PROMPT.format(
        question=q,
        original_essay=(original_essay or "").strip(),
        final_essay=(final_essay or "").strip(),
        existing_grammar=(existing_grammar or "").strip() or "（文法指摘なし）",
        existing_content=(existing_content or "").strip() or "（内容指摘なし）",
        existing_polish=(existing_polish or "").strip() or "（書き換えメモなし）",
    )


def _line_deduction_points(line: str) -> Optional[int]:
    """行末の（➖N点）等から減点幅を読む。無ければ None。"""
    t = _normalize_explanation_deduction_marks(line or "")
    m = re.search(r"（\s*-?\s*(\d+)\s*点\s*）", t)
    if not m:
        m = re.search(r"\(\s*-?\s*(\d+)\s*点\s*\)", t)
    if not m:
        return None
    try:
        return int(m.group(1))
    except ValueError:
        return None


def _is_explanation_bullet_line(line: str) -> bool:
    return bool(re.match(r"^(?:●|○|・)\s*", (line or "").strip()))


def _ensure_content_bullet_line(line: str) -> str:
    t = (line or "").strip()
    if not t:
        return line
    if re.match(r"^[\u2460-\u2473].*?(?:良い点|改善点|減点箇所)", t):
        return line
    if t in ("（記載なし）", "（該当なし）"):
        return t
    if re.match(r"^(?:内容|文法)減点\s*合計\s*[:：]", t):
        return t
    if t.startswith("【"):
        return line
    body = re.sub(r"^(?:●|○|・|-)\s*", "", t)
    if not body:
        return line
    return _ensure_explanation_bullet_line_punctuation(f"・{body}")


def _ensure_explanation_bullet_line_punctuation(line: str) -> str:
    t = (line or "").strip()
    if not t:
        return line
    if re.match(r"^(?:内容|文法)減点\s*合計\s*[:：]", t):
        return t
    if re.match(r"^[\u2460-\u2473].*?(?:良い点|改善点|減点箇所)", t):
        return t
    if t in ("（記載なし）", "（該当なし）"):
        return t
    if t.startswith("【"):
        return line
    if not re.match(r"^(?:●|○|・)", t):
        return line
    t = re.sub(r"。+$", "。", t)
    while "。。" in t:
        t = t.replace("。。", "。")
    t = re.sub(r"（-(\d+)点）\s*[。．]+", r"（-\1点）", t)
    if re.search(r"（-\d+点）\s*$", t):
        return t
    if re.search(r"[。．.!?！？]$", t) or re.search(r"[：:]\s*$", t):
        return t
    return f"{t}。"


def _strip_bullet_body(line: str) -> str:
    return re.sub(r"^(?:●|○|・)\s*", "", (line or "").strip()).strip()


_VAGUE_IMPROVEMENT_PHRASES = (
    "内容面の論点・構成を見直してください",
    "内容面の減点あり",
    "論点・構成を見直",
)


def _is_vague_improvement_bullet(line: str) -> bool:
    t = _strip_bullet_body(line)
    return any(p in t for p in _VAGUE_IMPROVEMENT_PHRASES)


def _looks_like_polish_not_content(line: str) -> bool:
    """文法・書き換えメモ（②改善点に誤配置されやすい）を検出。"""
    t = _strip_bullet_body(line)
    if not t:
        return False
    if "→" in t and re.search(r"[A-Za-z].*→.*[A-Za-z]", t):
        return True
    if re.search(r"(原文|完成版|書き換え)", t):
        return True
    if re.search(r"(補足|言い換え)[：:]", t) and re.search(r"[A-Za-z]|「|『|`", t):
        return True
    if re.search(r"^の(補足|説明|点)[：:]", t):
        return True
    return False


def _is_orphan_improvement_head(line: str) -> bool:
    t = _strip_bullet_body(line)
    return bool(re.match(r"^(の|節の)[一-龥ぁ-んァ-ン]+[：:]", t))


def _repair_split_improvement_bullets(bullets: List[str]) -> List[str]:
    """「that」+ 次行「節の補足：」のような分割や、欠落見出しを修復。"""
    out: List[str] = []
    for raw in bullets:
        b = raw.strip()
        if not b:
            continue
        body = _strip_bullet_body(b)
        if out and (_is_orphan_improvement_head(b) or re.match(r"^節の[一-龥]", body)):
            prev_body = _strip_bullet_body(out[-1]).rstrip("。．")
            if re.match(r"^[A-Za-z']{1,16}$", prev_body):
                merged = f"{prev_body}{body}"
                out[-1] = _ensure_content_bullet_line(merged)
                continue
            if re.search(r"[A-Za-z]$", prev_body):
                merged = f"{prev_body}{body}"
                out[-1] = _ensure_content_bullet_line(merged)
                continue
        out.append(b if b.startswith("・") else f"・{body}")
    return out


def _partition_improve_and_polish_notes(
    improve: List[str],
) -> Tuple[List[str], List[str]]:
    content_improve: List[str] = []
    polish_notes: List[str] = []
    for ln in improve:
        if _looks_like_polish_not_content(ln):
            body = _strip_bullet_body(ln)
            polish_notes.append(f"・{body.lstrip('・')}")
        else:
            content_improve.append(ln)
    return content_improve, polish_notes


def _grammar_line_to_polish_rewrite_note(line: str) -> Optional[str]:
    """文法●行を減点なしの完成版書き換えメモ（・ 原文 → 完成版：理由）へ変換。"""
    body = _strip_bullet_body(_normalize_explanation_bullet_line(line))
    if "→" not in body:
        return None
    body = _CONTENT_DEDUCTION_MARK_RE.sub("", body)
    body = re.sub(r"（➖\d+点[^）]*）", "", body)
    body = re.sub(r"（\s*-?\s*\d+\s*点\s*）", "", body).strip().rstrip("。．")
    if not body:
        return None
    note = body if body.startswith("・") else f"・{body}"
    return _ensure_explanation_bullet_line_punctuation(note)


def _grammar_lines_to_polish_rewrite_notes(grammar_comment: str) -> str:
    """文法減点行を、減点表記なしの【完成版の書き換え】箇条書きへ変換する。"""
    lines: List[str] = []
    seen: set[str] = set()
    for ln in _extract_grammar_bullet_lines(grammar_comment):
        note = _grammar_line_to_polish_rewrite_note(ln)
        if not note:
            continue
        key = _grammar_bullet_key(note)
        if key in seen:
            continue
        seen.add(key)
        lines.append(note)
    return "\n".join(lines).strip()


def _extract_polish_from_content_good(content_comment: str) -> List[str]:
    """①良い点のうち、完成版の書き換え・採用に触れる行を polish 候補として抽出。"""
    good, _, _ = _parse_content_comment_sections(content_comment or "")
    out: List[str] = []
    seen: set[str] = set()
    for ln in good:
        body = _strip_bullet_body(ln).rstrip("。．")
        if not body:
            continue
        if not re.search(r"完成版|書き換え|採用した|改めて|結論部.*(?:書|含|明示)", body):
            continue
        if "→" in body:
            note = _ensure_explanation_bullet_line_punctuation(
                body if body.startswith("・") else f"・{body}"
            )
        else:
            note = _ensure_explanation_bullet_line_punctuation(f"・完成版：{body}")
        key = _grammar_bullet_key(note)
        if key in seen:
            continue
        seen.add(key)
        out.append(note)
    return out


def _polish_fallback_from_grammar_explanations(grammar_comment: str) -> str:
    """polish が空のとき、文法行を完成版書き換えメモ形式に変換する。"""
    return _grammar_lines_to_polish_rewrite_notes(grammar_comment)


def ensure_nonempty_polish_comment(
    polish_comment: str,
    polish_from_grammar: str,
    grammar_comment: str,
    extra_polish_lines: Optional[List[str]] = None,
) -> str:
    pc = merge_polish_bullets_deduped((polish_comment or "").strip(), (polish_from_grammar or "").strip())
    for ln in extra_polish_lines or []:
        pc = merge_polish_bullets_deduped(pc, ln)
    if pc.strip():
        return pc
    fb = _polish_fallback_from_grammar_explanations(grammar_comment)
    return fb


def _collect_raw_improve_lines_under_section(text: str) -> List[str]:
    """②見出し以下の生行をすべて回収（パース落ち救済）。"""
    out: List[str] = []
    in_improve = False
    for line in (text or "").replace("\r\n", "\n").split("\n"):
        kind = _content_section_kind(line)
        if kind == "improve":
            in_improve = True
            m = re.match(r"^[\u2460-\u2473]+(?:改善点)\s*(.*)$", line.strip())
            if m and (m.group(1) or "").strip():
                out.append(m.group(1).strip())
            continue
        if kind in ("good", "deduct"):
            in_improve = False
            continue
        if not in_improve:
            continue
        t = line.strip()
        if t and not _content_section_kind(t):
            out.append(t)
    return out


def partition_grammar_and_polish_bullets(text: str) -> Tuple[str, str]:
    """文法●行を減点あり／減点なし（完成版の書き換え用）に分割する。"""
    ded_lines: List[str] = []
    polish_lines: List[str] = []
    seen_d: set[str] = set()
    seen_p: set[str] = set()
    for ln in (text or "").splitlines():
        t = ln.strip()
        if not t:
            continue
        if not _is_explanation_bullet_line(t):
            continue
        t = _normalize_explanation_bullet_line(ln)
        key = _grammar_bullet_key(t)
        pts = _line_deduction_points(t)
        if pts is None or pts <= 0:
            if key in seen_p:
                continue
            seen_p.add(key)
            polish_lines.append(re.sub(r"（\s*-?\s*0\s*点\s*）", "", t).strip())
            polish_lines[-1] = re.sub(r"\(\s*-?\s*0\s*点\s*\)", "", polish_lines[-1]).strip()
            polish_lines[-1] = re.sub(r"（➖0点[^）]*）", "", polish_lines[-1]).strip()
        else:
            if key in seen_d:
                continue
            seen_d.add(key)
            ded_lines.append(t)
    return "\n".join(ded_lines).strip(), "\n".join(polish_lines).strip()


def merge_polish_bullets_deduped(existing: str, additional: str) -> str:
    add_lines = _extract_grammar_bullet_lines(additional)
    if not add_lines:
        return (existing or "").strip()
    seen = {_grammar_bullet_key(ln) for ln in _extract_grammar_bullet_lines(existing)}
    out_lines = [ln for ln in (existing or "").splitlines() if ln.strip()]
    for ln in add_lines:
        key = _grammar_bullet_key(ln)
        if key in seen:
            continue
        seen.add(key)
        out_lines.append(ln)
    return "\n".join(out_lines).strip()


def content_comment_uses_legacy_format(content_comment: str) -> bool:
    """旧形式（①設問の条件…・【ヒント】長文）を検出する。"""
    cc = content_comment or ""
    legacy_markers = (
        "【ヒント】",
        "【結論の論点回収について】",
        "設問の条件",
        "設問に的確",
        "論理的整合性に問題",
        "①設問",
        "②設問",
        "③論理",
    )
    if any(m in cc for m in legacy_markers):
        return True
    if "①良い点" not in cc and re.search(r"①[^\n]{0,20}設問", cc):
        return True
    return False


def content_comment_has_required_sections(content_comment: str) -> bool:
    cc = content_comment or ""
    return "①良い点" in cc and "②改善点" in cc


def strip_legacy_blocks_from_content_comment(content_comment: str) -> str:
    """【ヒント】等の旧ブロックを除去（安全網）。"""
    cc = (content_comment or "").strip()
    if not cc:
        return cc
    cut = len(cc)
    for marker in ("【ヒント】", "【結論の論点回収について】", "【成長ヒント】"):
        idx = cc.find(marker)
        if idx >= 0:
            cut = min(cut, idx)
    if cut < len(cc):
        cc = cc[:cut].rstrip()
    return cc


CONTENT_IMPROVEMENT_PRAISE = "・改善する必要は特にありません。素晴らしい出来です。"
_CONTENT_SECTION_GOOD = "①良い点"
_CONTENT_SECTION_IMPROVE = "②改善点"
_CONTENT_DEDUCTION_MARK_RE = re.compile(
    r"[（(]\s*[➖\-−－]\s*(\d+)\s*点\s*[）)]"
)
_CONTENT_SECTION_HEAD_RE = re.compile(
    r"^[\u2460-\u2473].*?(?:良い点|改善点|減点箇所)"
)


def _content_section_kind(line: str) -> Optional[str]:
    t = line.strip()
    if not _CONTENT_SECTION_HEAD_RE.match(t):
        return None
    if "良い点" in t:
        return "good"
    if "改善点" in t:
        return "improve"
    if "減点箇所" in t:
        return "deduct"
    return None


def _parse_content_comment_sections(text: str) -> Tuple[List[str], List[str], List[str]]:
    """(① bullets, ② bullets, ③ bullets) — 見出し行は除く。"""
    good: List[str] = []
    improve: List[str] = []
    deduct: List[str] = []
    mode: Optional[str] = None
    for line in (text or "").replace("\r\n", "\n").split("\n"):
        kind = _content_section_kind(line)
        if kind:
            mode = kind
            m = re.match(
                r"^[\u2460-\u2473]+(?:良い点|改善点|減点箇所)\s*(.*)$",
                line.strip(),
            )
            if m and (m.group(1) or "").strip():
                tail = _ensure_content_bullet_line(m.group(1).strip())
                if kind == "good":
                    good.append(tail)
                elif kind == "improve":
                    improve.append(tail)
                else:
                    deduct.append(tail)
            continue
        t = line.strip()
        if not t:
            continue
        if mode == "good":
            good.append(_ensure_content_bullet_line(line))
        elif mode == "improve":
            improve.append(_ensure_content_bullet_line(line))
        elif mode == "deduct":
            deduct.append(_ensure_content_bullet_line(line))
    return good, improve, deduct


def _strip_content_deduction_mark(line: str) -> Tuple[str, int]:
    m = _CONTENT_DEDUCTION_MARK_RE.search(line or "")
    if not m:
        return (line or "").strip(), 0
    pts = int(m.group(1))
    clean = _CONTENT_DEDUCTION_MARK_RE.sub("", line or "").strip()
    return clean, pts


def _is_improvement_junk_bullet(line: str) -> bool:
    t = (line or "").strip().lstrip("・").strip()
    if not t:
        return True
    if t in ("（該当なし）", "（記載なし）", "②の改善点", "②の改善点を参照"):
        return True
    if t in ("（内容面の減点あり）",):
        return True
    if _is_vague_improvement_bullet(line):
        return True
    if re.match(r"^②", t):
        return True
    if "減点箇所" in t and len(t) < 24:
        return True
    return False


def _is_content_praise_bullet(line: str) -> bool:
    t = (line or "").strip().lstrip("・").strip()
    t, _ = _strip_content_deduction_mark(t)
    if not t:
        return False
    praise_markers = (
        "改善する必要は特にありません",
        "改善する必要はありません",
        "改善の必要は特にありません",
        "改善の必要はありません",
        "素晴らしい出来です",
        "素晴らしい",
        "とても素晴らしい",
        "大きな問題はありません",
        "特に問題はありません",
    )
    return any(m in t for m in praise_markers)


def _content_improve_section_has_praise_only(content_comment: str) -> bool:
    _, improve, _ = _parse_content_comment_sections(content_comment or "")
    if not improve:
        return CONTENT_IMPROVEMENT_PRAISE in (content_comment or "")
    return all(_is_content_praise_bullet(ln) for ln in improve)


def reconcile_content_deduction_with_comment(content_comment: str, content_deduction: int) -> int:
    """
    ②改善点の文言と内容減点を整合させる。
    褒めコメントのみのときは減点0。改善点に（-N点）があればその合計を優先する。
    """
    cd = max(0, min(25, int(content_deduction)))
    if _content_improve_section_has_praise_only(content_comment):
        return 0
    _, improve, _ = _parse_content_comment_sections(content_comment or "")
    marked = 0
    for ln in improve:
        if _is_content_praise_bullet(ln):
            continue
        _, pts = _strip_content_deduction_mark(ln)
        marked += max(0, pts)
    if marked > 0:
        return min(25, marked)
    if cd > 0 and not improve:
        return 0
    return cd


def apply_content_comment_finalization(
    content_comment: str, content_deduction: int
) -> Tuple[str, List[str], int]:
    """finalize_content_comment 後に減点と②改善点の矛盾を解消する。"""
    cc0 = (content_comment or "").strip()
    cd0 = max(0, min(25, int(content_deduction)))
    cc, polish = finalize_content_comment(cc0, cd0)
    cd = reconcile_content_deduction_with_comment(cc, cd0)
    if cd != cd0:
        cc, polish = finalize_content_comment(cc0, cd)
        cd = reconcile_content_deduction_with_comment(cc, cd)
    return cc, polish, cd


def _format_improvement_bullet(line: str, pts: int) -> str:
    base, _ = _strip_content_deduction_mark(line)
    base = base.strip().rstrip("。．")
    if not base.startswith("・"):
        base = f"・{base.lstrip('・')}"
    if pts <= 0:
        return _ensure_explanation_bullet_line_punctuation(base)
    formatted = f"{base}（-{pts}点）"
    return _ensure_explanation_bullet_line_punctuation(formatted)


def _distribute_content_deductions(n_bullets: int, total: int) -> List[int]:
    if n_bullets <= 0:
        return [total] if total > 0 else []
    marks = [0] * n_bullets
    rem = max(0, int(total))
    for i in range(n_bullets):
        left = n_bullets - i
        if left == 1:
            marks[i] = rem
            rem = 0
            break
        give = min(2, rem) if rem >= 2 else rem
        if rem >= left:
            give = max(1, min(2, rem - (left - 1)))
        marks[i] = give
        rem -= give
    if rem > 0:
        marks[-1] += rem
    return marks


def _recover_improvement_bullets_from_text(text: str) -> List[str]:
    """②改善点が空のとき、減点表記付き行や③減点箇所行を救済する。"""
    out: List[str] = []
    seen: set[str] = set()
    for line in (text or "").splitlines():
        t = line.strip()
        if not t or _content_section_kind(t):
            continue
        if _is_content_praise_bullet(t):
            continue
        if _CONTENT_DEDUCTION_MARK_RE.search(t):
            base, _ = _strip_content_deduction_mark(t)
            norm = _ensure_content_bullet_line(base)
            if norm and not _is_improvement_junk_bullet(norm) and norm not in seen:
                seen.add(norm)
                out.append(norm)
    return out


def finalize_content_comment(content_comment: str, content_deduction: int) -> Tuple[str, List[str]]:
    """
    content_comment を2区分（①良い点・②改善点）に整理する。
    - ③減点箇所を除去
    - 内容減点0点なら②を褒めコメント1行に
    - 内容減点ありなら②各行末に（-N点）を付与
    戻り値: (整形済み content_comment, ②から polish へ移す行)
    """
    cc = strip_legacy_blocks_from_content_comment(content_comment)
    good, improve, deduct = _parse_content_comment_sections(cc)
    cd = max(0, min(25, int(content_deduction)))

    good = [
        ln
        for ln in (_ensure_content_bullet_line(ln) for ln in good)
        if ln.strip() and not _is_improvement_junk_bullet(ln)
    ]
    improve = [ln for ln in improve if not _is_improvement_junk_bullet(ln)]
    improve = _repair_split_improvement_bullets(improve)
    improve, polish_from_content = _partition_improve_and_polish_notes(improve)

    if cd == 0:
        improve_out = [CONTENT_IMPROVEMENT_PRAISE]
    else:
        bullets: List[str] = []
        marks: List[int] = []
        for ln in improve:
            if _is_content_praise_bullet(ln):
                continue
            base, pts = _strip_content_deduction_mark(ln)
            if _is_improvement_junk_bullet(base) or _is_vague_improvement_bullet(base):
                continue
            if len(_strip_bullet_body(base)) < 12:
                continue
            bullets.append(_ensure_content_bullet_line(base))
            marks.append(pts)
        for ln in deduct:
            if _is_improvement_junk_bullet(ln):
                continue
            base, pts = _strip_content_deduction_mark(ln)
            if not base or _is_improvement_junk_bullet(base) or _is_vague_improvement_bullet(base):
                continue
            norm = _ensure_content_bullet_line(base)
            if norm not in bullets:
                bullets.append(norm)
                marks.append(pts)

        if not bullets:
            for raw_ln in _collect_raw_improve_lines_under_section(cc):
                if _is_improvement_junk_bullet(raw_ln) or _is_vague_improvement_bullet(raw_ln):
                    continue
                if _looks_like_polish_not_content(raw_ln):
                    polish_from_content.append(
                        f"・{_strip_bullet_body(raw_ln)}"
                    )
                    continue
                base, pts = _strip_content_deduction_mark(raw_ln)
                if len(_strip_bullet_body(base)) < 12:
                    continue
                norm = _ensure_content_bullet_line(base)
                if norm not in bullets:
                    bullets.append(norm)
                    marks.append(pts)

        if not bullets:
            bullets = _recover_improvement_bullets_from_text(cc)
            bullets = [
                b
                for b in _repair_split_improvement_bullets(bullets)
                if not _is_vague_improvement_bullet(b)
            ]
            marks = []
            for ln in bullets:
                _, pts = _strip_content_deduction_mark(ln)
                marks.append(pts)

        mark_sum = sum(marks)
        if mark_sum != cd and bullets:
            marks = _distribute_content_deductions(len(bullets), cd)

        improve_out = [_format_improvement_bullet(b, p) for b, p in zip(bullets, marks)]

    lines: List[str] = [_CONTENT_SECTION_GOOD]
    lines.extend(good if good else ["・（記載なし）"])
    lines.append(_CONTENT_SECTION_IMPROVE)
    lines.extend(improve_out)
    return "\n".join(lines).strip(), polish_from_content


def grammar_comment_has_zero_point_lines(text: str) -> bool:
    for ln in (text or "").splitlines():
        pts = _line_deduction_points(ln)
        if pts is not None and pts <= 0:
            return True
    return False


def _grammar_error_phrase(line: str) -> str:
    m = re.search(r"^(?:●|○|・)\s*`?([^`→]+)`?\s*→", (line or "").strip())
    if m:
        return re.sub(r"\s+", " ", m.group(1).lower().strip())
    return _grammar_bullet_key(line)


def _grammar_dedup_group_id(line: str) -> Optional[str]:
    t = (line or "").lower()
    if re.search(
        r"rather than|such as[^→]{0,60}\than\b|high(?:er)?\s+value|\bhigh\s+value[^→]{0,80}\than",
        t,
    ):
        return "than_rather_cluster"
    if re.search(r"recent years|has been increasing|is increasing", t):
        return "recent_years_tense"
    if re.search(
        r"important\s+than|more important|isn't very important|is not more important",
        t,
    ):
        return "comparative_important"
    return None


def _score_grammar_bullet(line: str, group_id: str) -> int:
    t = (line or "").lower()
    score = len(line or "")
    if group_id == "than_rather_cluster":
        if "rather than" in t:
            score += 30
        if "higher" in t:
            score += 30
        if "than on" in t:
            score += 20
        if "①" in (line or "") or "②" in (line or ""):
            score += 25
        if "such as" in t and "共存" in (line or ""):
            score += 15
    elif group_id == "recent_years_tense":
        if "in recent years" in t:
            score += 40
        if "has been increasing" in t:
            score += 40
    elif group_id == "comparative_important":
        if "more important than" in t:
            score += 50
    return score


_THAN_RATHER_CANONICAL = (
    "● `high value ... such as ... than earning` → "
    "① `put a high value on ... rather than earning` "
    "② `put a higher value on ... than on earning`："
    "原級＋than は不可。such as と than は共存不可。"
    "完成版で採用した方を明記すること。（➖2点）"
)

_RECENT_YEARS_CANONICAL = (
    "● `Second, recent years, ... is increasing` → "
    "`Second, in recent years, ... has been increasing`："
    "`recent years` には前置詞 in が必要。"
    "`in recent years` は現在までの継続を示すため現在完了進行形が自然。（➖3点）"
)

_COMPARATIVE_IMPORTANT_CANONICAL = (
    "● `isn't very important than other factors` → "
    "`is not more important than other factors`："
    "比較には比較級 more important が必要。very は than と共起しない。（➖2点）"
)

_GRAMMAR_CANONICAL_BY_GROUP = {
    "than_rather_cluster": _THAN_RATHER_CANONICAL,
    "recent_years_tense": _RECENT_YEARS_CANONICAL,
    "comparative_important": _COMPARATIVE_IMPORTANT_CANONICAL,
}


def _resolve_grammar_group_bullet(group_id: str, group_lines: List[str]) -> str:
    if len(group_lines) == 1:
        return group_lines[0]
    best = max(group_lines, key=lambda ln: _score_grammar_bullet(ln, group_id))
    canonical = _GRAMMAR_CANONICAL_BY_GROUP.get(group_id)
    if not canonical:
        return best
    bt = best.lower()
    if group_id == "than_rather_cluster":
        has_both = (
            ("rather than" in bt or "①" in best)
            and ("higher" in bt or "than on" in bt or "②" in best)
        )
        return best if has_both else canonical
    if group_id == "recent_years_tense":
        if len(group_lines) >= 2:
            return canonical
        if "in recent years" in bt and "has been increasing" in bt:
            return best
        return canonical
    if group_id == "comparative_important":
        if "more important than" in bt:
            return best
        return canonical
    return best


def collapse_duplicate_grammar_bullets(text: str) -> str:
    """同一誤りクラスターの grammar ●行を1本にまとめる。"""
    lines = _extract_grammar_bullet_lines(text)
    if not lines:
        return (text or "").strip()

    group_buckets: Dict[str, List[str]] = {}
    for ln in lines:
        gid = _grammar_dedup_group_id(ln)
        if gid:
            group_buckets.setdefault(gid, []).append(ln)

    resolved_group = {
        gid: _resolve_grammar_group_bullet(gid, gl) for gid, gl in group_buckets.items()
    }

    out: List[str] = []
    seen_g: set[str] = set()
    seen_u: set[str] = set()
    for ln in lines:
        gid = _grammar_dedup_group_id(ln)
        if gid:
            if gid in seen_g:
                continue
            seen_g.add(gid)
            out.append(resolved_group[gid])
        else:
            key = _grammar_error_phrase(ln)
            if key in seen_u:
                continue
            seen_u.add(key)
            out.append(ln)
    return "\n".join(out).strip()


_POLISH_JUNK_LINE_RE = re.compile(
    r"^(?:【完成版(?:の(?:書き換え|ポイント))?】|文法減点\s*合計|内容減点\s*合計|・?\s*（該当なし）|●\s*（該当なし）)\s*$"
)


def _polish_line_overlaps_grammar_deduction(polish_line: str, grammar_text: str) -> bool:
    """grammar 減点行と「誤り側」が同一の polish のみ除去（広義キーワード一致は使わない）。"""
    left_p = _grammar_error_phrase(polish_line)
    if not left_p:
        return False
    for gl in _extract_grammar_bullet_lines(grammar_text):
        pts = _line_deduction_points(gl)
        if pts is None or pts <= 0:
            continue
        left_g = _grammar_error_phrase(gl)
        if not left_g:
            continue
        if left_p == left_g:
            return True
        if len(left_p) >= 12 and (left_p in left_g or left_g in left_p):
            return True
    return False


def sanitize_polish_comment(polish_comment: str, grammar_comment: str) -> str:
    """polish_comment から見出し・合計行・（該当なし）を除去する（文法行との意味重複は除去しない）。"""
    _ = grammar_comment  # 文法ブロックとの重複除去は行わない（減点あり／なしで別枠）
    out: List[str] = []
    seen: set[str] = set()
    for ln in (polish_comment or "").splitlines():
        t = ln.strip()
        if not t:
            continue
        if _POLISH_JUNK_LINE_RE.match(t):
            continue
        if "【完成版" in t and not _is_explanation_bullet_line(t):
            continue
        if "減点" in t and "合計" in t and not _is_explanation_bullet_line(t):
            continue
        if _CONTENT_DEDUCTION_MARK_RE.search(t) or re.search(r"（➖\d+点", t):
            continue
        if not _is_explanation_bullet_line(t):
            continue
        t = _normalize_explanation_bullet_line(ln)
        t = _CONTENT_DEDUCTION_MARK_RE.sub("", t).strip()
        t = re.sub(r"（➖\d+点[^）]*）", "", t).strip()
        if not t:
            continue
        key = _grammar_bullet_key(t)
        if key in seen:
            continue
        seen.add(key)
        out.append(_ensure_explanation_bullet_line_punctuation(t))
    return "\n".join(out).strip()


def finalize_grammar_and_polish_blocks(
    *,
    grammar_comment: str,
    polish_comment: str,
    body_explanation: str,
    extra_polish_lines: Optional[List[str]] = None,
    content_comment: str = "",
) -> Tuple[str, str, str]:
    """grammar / polish を減点あり・減点なしに整理し、本文●行も取り込む。"""
    body = (body_explanation or "").strip()
    gc = (grammar_comment or "").strip()
    pc = (polish_comment or "").strip()
    combined = _append_grammar_bullets_deduped(body, gc)
    ded, polish_from_g = partition_grammar_and_polish_bullets(combined)
    ded = collapse_duplicate_grammar_bullets(ded)
    pc = merge_polish_bullets_deduped(pc, polish_from_g)
    if extra_polish_lines:
        for ln in extra_polish_lines:
            if (ln or "").strip():
                pc = merge_polish_bullets_deduped(pc, ln)
    for ln in _extract_polish_from_content_good(content_comment):
        pc = merge_polish_bullets_deduped(pc, ln)
    pc = sanitize_polish_comment(pc, ded)
    grammar_polish = _grammar_lines_to_polish_rewrite_notes(ded)
    if grammar_polish:
        pc = merge_polish_bullets_deduped(pc, grammar_polish)
    if not pc.strip():
        pc = _polish_fallback_from_grammar_explanations(ded)
    return ded, pc, ""


def ensure_polish_points_for_final_diff(
    *,
    original_essay: str,
    final_essay: str,
    polish_comment: str,
    grammar_comment: str,
    content_comment: str = "",
) -> str:
    """
    原文と完成版が異なるとき、【完成版のポイント】に修正・追記の箇条書きを必ず残す。
    """
    orig_n = _normalize_essay_for_compare(original_essay)
    final_n = _normalize_essay_for_compare(final_essay)
    if not orig_n or not final_n or orig_n == final_n:
        return (polish_comment or "").strip()

    pc = ensure_nonempty_polish_comment(
        (polish_comment or "").strip(),
        "",
        grammar_comment,
        extra_polish_lines=_extract_polish_from_content_good(content_comment),
    )
    if _extract_grammar_bullet_lines(pc):
        return pc

    grammar_notes = _grammar_lines_to_polish_rewrite_notes(grammar_comment)
    if grammar_notes:
        return merge_polish_bullets_deduped(pc, grammar_notes)

    summary = (
        "・完成版では原文を整え、内容・文法の指摘を反映して"
        "読みやすく自然な英文に仕上げました。"
    )
    return merge_polish_bullets_deduped(pc, summary)


def _grammar_bullet_key(line: str) -> str:
    t = re.sub(r"\s+", " ", (line or "").strip().lower())
    t = re.sub(r"（\s*-?\s*\d+\s*点\s*）", "", t)
    return t


def _extract_grammar_bullet_lines(text: str) -> List[str]:
    out: List[str] = []
    for ln in (text or "").splitlines():
        t = ln.strip()
        if _is_explanation_bullet_line(t):
            out.append(_normalize_explanation_bullet_line(ln))
    return out


def _combined_grammar_bullets_text(body_explanation: str, grammar_comment: str) -> str:
    seen: set[str] = set()
    lines: List[str] = []
    for src in (body_explanation, grammar_comment):
        for ln in _extract_grammar_bullet_lines(src):
            key = _grammar_bullet_key(ln)
            if key in seen:
                continue
            seen.add(key)
            lines.append(ln)
    return "\n".join(lines)


def _insert_content_additions_before_hint(content_comment: str, additions: str) -> str:
    add = (additions or "").strip()
    if not add:
        return content_comment
    cc = (content_comment or "").strip()
    if not cc:
        return add
    for anchor in ("②改善点",):
        idx = cc.find(anchor)
        if idx >= 0:
            before = cc[:idx].rstrip()
            after = cc[idx:]
            return f"{before}\n\n{add}\n\n{after}"
    return f"{cc}\n\n{add}"


def _append_grammar_bullets_deduped(existing: str, additional: str) -> str:
    add_lines = _extract_grammar_bullet_lines(additional)
    if not add_lines:
        return (existing or "").strip()
    seen = {_grammar_bullet_key(ln) for ln in _extract_grammar_bullet_lines(existing)}
    out_lines = [ln for ln in (existing or "").splitlines() if ln.strip()]
    for ln in add_lines:
        key = _grammar_bullet_key(ln)
        if key in seen:
            continue
        seen.add(key)
        out_lines.append(ln)
    return "\n".join(ln for ln in out_lines if ln.strip()).strip()


def rebuild_evaluation_line(*, content_deduction: int, grammar_deduction: int) -> str:
    cd = max(0, min(25, int(content_deduction)))
    gd = max(0, min(25, int(grammar_deduction)))
    cs = 25 - cd
    gs = 25 - gd
    return f"【内容{cs}点＋文法{gs}点 ＝ 合計{cs + gs}点】"


def parse_feedback_coverage_audit_response(raw: str) -> Dict[str, str]:
    """第3パス監査の JSON を読み取る。"""
    s = (raw or "").strip()
    if not s:
        return {"additional_grammar_bullets": "", "content_comment_additions": "", "additional_polish_bullets": ""}

    marker_start = "<<NEXUS_FEEDBACK_AUDIT_JSON>>"
    marker_end = "<<END_NEXUS_FEEDBACK_AUDIT_JSON>>"
    if marker_start in s:
        _, _, tail = s.partition(marker_start)
        if marker_end in tail:
            tail = tail.split(marker_end, 1)[0]
        blob = tail.strip()
    else:
        blob = s

    blob = _slice_from_first_object_brace(blob) or blob
    json_raw = _extract_first_balanced_json_object(blob) or blob
    try:
        o = json.loads(json_raw)
        if isinstance(o, dict):
            return {
                "additional_grammar_bullets": str(
                    o.get("additional_grammar_bullets") or ""
                ).strip(),
                "content_comment_additions": str(
                    o.get("content_comment_additions") or ""
                ).strip(),
                "additional_polish_bullets": str(
                    o.get("additional_polish_bullets") or ""
                ).strip(),
            }
    except Exception:
        pass

    salv = _salvage_section_dict_from_blob(s)
    return {
        "additional_grammar_bullets": str(
            salv.get("additional_grammar_bullets") or ""
        ).strip(),
        "content_comment_additions": str(
            salv.get("content_comment_additions") or ""
        ).strip(),
        "additional_polish_bullets": str(
            salv.get("additional_polish_bullets") or ""
        ).strip(),
    }


def merge_feedback_coverage_audit(
    *,
    body_explanation: str,
    content_comment: str,
    grammar_comment: str,
    polish_comment: str,
    content_deduction: int,
    grammar_deduction: int,
    additional_grammar_bullets: str,
    content_comment_additions: str,
    additional_polish_bullets: str = "",
) -> Tuple[str, str, str, int, int, str]:
    """
    監査で見つかった追記分を既存指摘へマージし、減点合計を再計算する。
    戻り値: body_explanation, content_comment, grammar_comment, content_deduction, grammar_deduction, polish_comment
    """
    body = (body_explanation or "").strip()
    cc = (content_comment or "").strip()
    gc = (grammar_comment or "").strip()
    pc = (polish_comment or "").strip()
    add_g = (additional_grammar_bullets or "").strip()
    add_c = (content_comment_additions or "").strip()
    add_p = (additional_polish_bullets or "").strip()

    if add_g:
        body = _append_grammar_bullets_deduped(body, add_g)
        gc = _append_grammar_bullets_deduped(gc, add_g)
    if add_c:
        cc = _insert_content_additions_before_hint(cc, add_c)
        cc = _normalize_ai_content_comment_block(cc)
    if add_p:
        pc = merge_polish_bullets_deduped(pc, add_p)

    combined_grammar = gc
    gd_new = _sum_deduction_points_from_explanation(combined_grammar)
    gd_new = max(0, min(25, gd_new))
    if gd_new == 0 and grammar_deduction > 0 and not add_g:
        gd_new = max(0, min(25, int(grammar_deduction)))

    cd_new = _sum_deduction_points_from_explanation(cc)
    cd_new = max(0, min(25, cd_new))
    if cd_new == 0 and content_deduction > 0 and not add_c:
        if not _content_improve_section_has_praise_only(cc):
            cd_new = max(0, min(25, int(content_deduction)))

    cc, polish_relocated, cd_new = apply_content_comment_finalization(cc, cd_new)

    gc, pc, body = finalize_grammar_and_polish_blocks(
        grammar_comment=gc,
        polish_comment=pc,
        body_explanation=body,
        extra_polish_lines=polish_relocated,
        content_comment=cc,
    )
    gd_new = max(0, min(25, _sum_deduction_points_from_explanation(gc)))

    return body, cc, gc, cd_new, gd_new, pc


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
    if not _non_empty_str(o.get("polish_comment")):
        for k in ("polishComment", "PolishComment", "polish_notes", "final_rewrite_comment", "完成版の書き換え"):
            if _non_empty_str(o.get(k)):
                o["polish_comment"] = str(o.get(k) or "").strip()
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
    has_axis = ("①良い点" in t) or (("①" in t) and ("②" in t) and ("③" in t))
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
_POLISH_SECTION_HEAD_PY = "【完成版のポイント】"
_POLISH_SECTION_HEAD_LEGACY_PY = "【完成版】"
_POLISH_SECTION_HEAD_REWRITE_LEGACY_PY = "【完成版の書き換え】"
_HINT_HEAD_PY = "【ヒント】"
_EXPLANATION_BULLET_PY = "・"


def _is_explanation_deduction_summary_line(line: str) -> bool:
    t = re.sub(r"^[●○・]\s*", "", (line or "").strip())
    return bool(re.match(r"^(文法|内容)減点\s*合計\s*[:：]", t))


def _strip_explanation_deduction_summary_line(line: str) -> str:
    indent_m = re.match(r"^\s*", line or "")
    indent = indent_m.group(0) if indent_m else ""
    t = re.sub(r"^[●○・]\s*", "", (line or "").strip())
    return indent + t


def _normalize_explanation_bullet_line(line: str) -> str:
    indent_m = re.match(r"^\s*", line or "")
    indent = indent_m.group(0) if indent_m else ""
    t = (line or "").strip()
    if not t:
        return line
    if _is_explanation_deduction_summary_line(t):
        return _strip_explanation_deduction_summary_line(line)
    body = re.sub(r"^(?:●|○|・)\s*", "", t)
    if not body:
        return line
    return indent + _ensure_explanation_bullet_line_punctuation(_EXPLANATION_BULLET_PY + body)


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
    content_sub: Optional[str] = None
    polish_has_bullets = False

    def trimmed(s: str) -> str:
        return s.strip()

    def is_content_head(s: str) -> bool:
        return trimmed(s) == _CONTENT_SECTION_HEAD_PY

    def is_grammar_head(s: str) -> bool:
        t = trimmed(s)
        return t == _GRAMMAR_SECTION_HEAD_PY or t == "【文法】"

    def is_polish_head(s: str) -> bool:
        t = trimmed(s)
        return t in (
            _POLISH_SECTION_HEAD_PY,
            _POLISH_SECTION_HEAD_LEGACY_PY,
            _POLISH_SECTION_HEAD_REWRITE_LEGACY_PY,
        )

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
                content_sub = None
                out.append(line)
                continue
            if is_grammar_head(line):
                mode = "grammar_body"
                out.append(line)
                continue
            if is_polish_head(line):
                mode = "polish_body"
                polish_has_bullets = False
                out.append(_POLISH_SECTION_HEAD_PY)
                continue
            out.append(line)
            continue
        if mode == "content_body":
            if is_grammar_head(line):
                mode = "grammar_body"
                content_sub = None
                out.append(line)
                continue
            if is_polish_head(line):
                mode = "polish_body"
                content_sub = None
                polish_has_bullets = False
                out.append(_POLISH_SECTION_HEAD_PY)
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
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            stripped_bullet = strip_content_leading_markers(t)
            indent_m = re.match(r"^\s*", line)
            indent = indent_m.group(0) if indent_m else ""
            if re.match(r"^[\u2460-\u2473]", stripped_bullet):
                head_m = re.match(
                    r"^([\u2460-\u2473]+(?:良い点|改善点|減点箇所))(\s*)([\s\S]*)$",
                    stripped_bullet,
                )
                if head_m:
                    head = head_m.group(1) or ""
                    tail = (head_m.group(3) or "").strip()
                    if "良い点" in head:
                        content_sub = "good"
                    elif "改善点" in head:
                        content_sub = "improve"
                    else:
                        content_sub = "deduct"
                    out.append(indent + head)
                    if tail:
                        out.append(_ensure_content_bullet_line(tail))
                else:
                    out.append(indent + stripped_bullet)
                continue
            if stripped_bullet == _HINT_HEAD_PY or stripped_bullet.startswith(_HINT_HEAD_PY):
                out.append(indent + stripped_bullet)
                continue
            if t == "（記載なし）":
                out.append(line)
                continue
            if content_sub in ("good", "improve", "deduct"):
                out.append(_ensure_content_bullet_line(stripped_bullet or t))
                continue
            out.append(indent + stripped_bullet if stripped_bullet else line)
            continue
        if mode == "grammar_body":
            if is_grammar_deduction_line(line):
                mode = "outer"
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            if is_polish_head(line):
                mode = "polish_body"
                polish_has_bullets = False
                out.append(_POLISH_SECTION_HEAD_PY)
                continue
            t = trimmed(line)
            if not t:
                out.append(line)
                continue
            if _is_explanation_deduction_summary_line(t):
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            if t.startswith("●") or t.startswith("○") or t.startswith("・"):
                out.append(_normalize_explanation_bullet_line(line))
                continue
            if is_content_deduction_line(line):
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            if t in ("（記載なし）", "（該当なし）"):
                out.append(line)
                continue
            out.append(_normalize_explanation_bullet_line(f"・{t}"))
            continue
        if mode == "polish_body":
            if is_polish_head(line):
                continue
            if is_content_head(line) or is_grammar_head(line):
                mode = "grammar_body" if is_grammar_head(line) else "content_body"
                out.append(line)
                continue
            t = trimmed(line)
            if not t:
                out.append(line)
                continue
            if _is_explanation_deduction_summary_line(t):
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            if t.startswith("●") or t.startswith("○") or t.startswith("・"):
                polish_has_bullets = True
                out.append(_normalize_explanation_bullet_line(line))
                continue
            if t in ("（記載なし）", "（該当なし）"):
                if polish_has_bullets:
                    continue
                out.append(line)
                continue
            if "減点" in t and "合計" in t:
                out.append(_strip_explanation_deduction_summary_line(line))
                continue
            out.append(_normalize_explanation_bullet_line(f"・{t}"))
            continue
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
    """JSON の grammar_comment 専用: 各行を ・ 始まりに（減点合計行は除外しないが通常無い）。"""
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
        if t.startswith("●") or t.startswith("○") or t.startswith("・"):
            out.append(_normalize_explanation_bullet_line(line))
            continue
        out.append(_normalize_explanation_bullet_line(f"・{t}"))
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
    polish_comment: str = "",
    content_deduction: int,
    grammar_deduction: int,
    content_max: int = 25,
    grammar_max: int = 25,
) -> str:
    """
    本文から取った文法●行・JSON の content/grammar/polish を、生徒画面・PDF と同型の
    【内容】… / 【文法・語法・表現】… / 【完成版のポイント】… にまとめる。
    """
    c = (content_comment or "").strip()
    g_json = (grammar_comment or "").strip()
    g_body = (body_explanation or "").strip()
    p_json = (polish_comment or "").strip()
    p_json = re.sub(
        r"^(?:【完成版(?:の(?:書き換え|ポイント))?】)\s*\n?",
        "",
        p_json,
        flags=re.MULTILINE,
    ).strip()
    if g_json and g_body:
        g = g_body if _grammar_block_has_deduction_marks(g_body) and not _grammar_block_has_deduction_marks(
            g_json
        ) else g_json
    else:
        g = g_json or g_body
    g, p_json, _ = finalize_grammar_and_polish_blocks(
        grammar_comment=g,
        polish_comment=p_json,
        body_explanation="",
        content_comment=c,
    )
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
    lines.append("")
    lines.append(_POLISH_SECTION_HEAD_PY)
    lines.append(p_json if p_json else "（該当なし）")
    raw = "\n".join(lines).strip()
    raw = realign_grammar_deduction_marks_in_merged_explanation(raw, grammar_deduction=gd)
    return normalize_student_explanation_text(raw)


def parse_free_writing_feedback(raw_result: str) -> Tuple[str, str, str, str, str, str, str, int, int]:
    """
    ESSAY_PROMPT の生テキスト出力を分解する。
    戻り値: evaluation, general_comment, explanation, final_version, content_comment,
            grammar_comment, polish_comment, content_deduction, grammar_deduction
    """
    raw_full = raw_result or ""
    raw_result = raw_result.replace("**", "").strip()
    raw_result, section_json = _extract_section_json(raw_result)
    if not raw_result:
        return "採点エラー", "", "", "", "", "", "", 0, 0
    if raw_result.startswith("採点エラーが発生しました"):
        return raw_result.strip(), "", "", "", "", "", "", 0, 0

    lines = raw_result.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()

    if not lines:
        return "採点エラー", "", "", "", "", "", "", 0, 0

    evaluation = lines[0].strip()
    if len(lines) == 1:
        return evaluation, "", "", "", "", "", "", 0, 0

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
    polish_comment = _normalize_ai_grammar_comment_block(str(section_json.get("polish_comment") or "").strip())
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

    if content_comment_uses_legacy_format(content_comment):
        content_comment = ""

    if not (content_comment or "").strip():
        salv2 = _salvage_section_dict_from_blob(raw_full.replace("**", ""))
        if _non_empty_str(salv2.get("content_comment")):
            salv_cc = _normalize_ai_content_comment_block(
                str(salv2.get("content_comment") or "").strip()
            )
            if not content_comment_uses_legacy_format(salv_cc):
                content_comment = salv_cc

    if not (content_comment or "").strip():
        content_comment = (
            "①良い点\n・（読み取り失敗 — 再実行または手入力）\n"
            "②改善点\n・（記載なし）"
        )

    content_comment, polish_relocated, content_deduction = apply_content_comment_finalization(
        _normalize_ai_content_comment_block(content_comment),
        content_deduction,
    )
    grammar_comment, polish_comment, explanation = finalize_grammar_and_polish_blocks(
        grammar_comment=grammar_comment,
        polish_comment=polish_comment,
        body_explanation=explanation,
        extra_polish_lines=polish_relocated,
        content_comment=content_comment,
    )
    general_comment = ""

    return (
        evaluation,
        general_comment,
        explanation,
        final_version,
        content_comment,
        grammar_comment,
        polish_comment,
        content_deduction,
        grammar_deduction,
    )


def read_aloud_english_from_proofread(pr: Dict[str, Any]) -> str:
    """TTS 用: final_essay があればそれ。なければ final_version から語数表記を除いた英文。"""
    fe = str(pr.get("final_essay") or "").strip()
    if fe:
        return strip_final_essay_artifacts(fe)
    fv = str(pr.get("final_version") or "").strip()
    if fv:
        return strip_final_essay_artifacts(finalize_final_version_for_display(fv, append_word_count=False))
    return ""


def _normalize_essay_for_compare(s: str) -> str:
    """TypeScript normalizeEssayForCompare と同等（完成版・原文の同一判定）。"""
    t = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    t = re.sub(r"[ \t\xa0]+", " ", t)
    t = re.sub(r"\s*\n+\s*", " ", t)
    return t.strip()


def resolve_final_essay_for_student_display(
    submission: Dict[str, Any],
) -> Tuple[str, str]:
    """
    生徒画面の「完成版」と同じ英文を返す（original, revised）。
    src/lib/student-final-essay-display.ts の resolveFinalEssayForStudentDisplay と揃える。
    """
    original = str(submission.get("essayText") or "")
    sr = submission.get("studentRelease") or {}
    pr = submission.get("proofread") or {}
    from_release = ""
    if str(sr.get("operatorApprovedAt") or "").strip() or str(sr.get("operatorFinalizedAt") or "").strip():
        from_release = str(sr.get("finalText") or "").strip()
    orig_n = _normalize_essay_for_compare(original)
    rel_n = _normalize_essay_for_compare(from_release)
    from_proofread = read_aloud_english_from_proofread(pr)

    if from_release and rel_n != orig_n:
        return original, strip_final_essay_artifacts(from_release)
    if from_proofread:
        return original, from_proofread
    if from_release:
        return original, strip_final_essay_artifacts(from_release)
    return original, ""


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
    """TTS・PDF 用: 生徒向け完成版表示と同じルールで revised 英文を返す。"""
    _original, revised = resolve_final_essay_for_student_display(submission)
    return revised


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
