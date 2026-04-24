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
- 上記の通常出力をすべて出した後、最後に次の3行を必ず追加すること。
<<NEXUS_SECTION_JSON>>
{"content_comment":"...","grammar_comment":"...","content_deduction":0,"grammar_deduction":0}
<<END_NEXUS_SECTION_JSON>>

- content_comment には、**設問の条件・趣旨を満たしているか／論理的整合性・因果のつながり／設問に対して的確に答えているか（飛躍・破綻の有無）**について**よしあし**（良い点と改善点）をはっきり述べる文章だけを書く（冠詞・綴り・時制・一致・語順・前置詞・品詞・接続の誤りなど**形・用法の指摘は絶対に書かない**）。
- **良い場合**：上記の各観点について具体的に認め、**「とても素晴らしいです」レベルの力強い称賛**を交えて前向きに伝える（空疎な一言だけにしない）。
- **改善が必要な場合**：どこがどう問題かを明示し、**どう書き換えればよいか**をコンパクトに提案する。提案は**通常出力の最終行「完成版の英文」に必ず反映**する（内容の指摘だけで終わらせない）。
- 実務上、設問に沿って書けている答案では**大きな内容の問題は少ない**ことが多い。その場合も上記観点を踏まえて**よしあし**を述べ、内容の欠点を無理に作らない。**細かい誤りの大半は grammar_comment に集約**すること。
- grammar_comment には「文法・語法・構文・綴り・冠詞・一致・前置詞・コロケーション」など**形と用法の指摘**だけを書く（設問の読み落としや論旨の破綻は書かない）。
- content_comment は箇条書きにし、各行を「● 」で始める。改行の直後に句読点（、。など）だけが来ないようにする（句読点は必ず前行の末尾に付ける）。
- grammar_comment は文法・語法・表現の指摘をそれぞれ箇条書きにし、各項目の行頭は必ず「● 」（中黒＋半角スペース）から始める。
- 指摘中に英文を書くときは、日本語のカギ括弧「」で囲まない（そのまま英語を書く）。
- content_deduction / grammar_deduction は整数で、1行目の【内容X点＋文法Y点】と必ず一致する値にする。
- 内容減点が無いときは content_deduction は 0。
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


def finalize_final_version_for_display(s: str, append_word_count: bool = True) -> str:
    if not s:
        return s
    base = _strip_word_count_markers_anywhere(_normalize_final_version_text(s))
    if not append_word_count:
        return base
    n = count_english_words(base)
    if n <= 0:
        return base
    return f"{base.rstrip()} ({n} words)"


def _extract_section_json(raw_result: str) -> Tuple[str, Dict[str, Any]]:
    pat = re.compile(
        r"<<NEXUS_SECTION_JSON>>\s*(\{.*?\})\s*<<END_NEXUS_SECTION_JSON>>\s*$",
        re.DOTALL,
    )
    m = pat.search(raw_result or "")
    if not m:
        return raw_result, {}
    json_raw = m.group(1)
    text_wo = (raw_result[: m.start()] + raw_result[m.end() :]).strip()
    try:
        parsed = json.loads(json_raw)
        if isinstance(parsed, dict):
            return text_wo, parsed
    except Exception:
        pass
    return text_wo, {}


_GRAMMAR_SECTION_HEAD_PY = "【文法・語法・表現】"
_CONTENT_SECTION_HEAD_PY = "【内容】"


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
    【内容】内の行頭句読点を前行へ寄せ、【内容】・【文法・語法・表現】の箇条書きに ● を付与する。
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
            if t.startswith("●") or t.startswith("○"):
                out.append(line)
                continue
            out.append(f"● {t}")
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
        out.append(f"● {t}")
    return "\n".join(out)


def _normalize_ai_content_comment_block(text: str) -> str:
    """JSON の content_comment 専用: 行頭の句読点を前行末へ寄せ、各行を ● 始まりに。"""
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
        if t.startswith("●") or t.startswith("○"):
            out.append(line)
            continue
        out.append(f"● {t}")
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


def parse_free_writing_feedback(raw_result: str) -> Tuple[str, str, str, str, str, str, int, int]:
    """
    ESSAY_PROMPT の生テキスト出力を分解する。
    戻り値: evaluation, general_comment, explanation, final_version
    """
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
        exp = normalize_student_explanation_text(canonicalize_legacy_grammar_heading_explanation(exp))
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
        exp = normalize_student_explanation_text(canonicalize_legacy_grammar_heading_explanation(exp))
        return (
            ev,
            str(sr.get("generalComment") or "").strip(),
            exp,
        )
    pr = submission.get("proofread") or {}
    if (pr.get("evaluation") or "").strip():
        exp_pr = normalize_student_explanation_text(
            canonicalize_legacy_grammar_heading_explanation(str(pr.get("explanation") or "").strip())
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
