import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

from gemini_working_model import get_working_model

from nl_essay_feedback import (  # noqa: E402
    build_nl_essay_prompt,
    finalize_final_version_for_display,
    grammar_body_from_merged_explanation,
    merge_proofread_explanation_for_storage,
    parse_free_writing_feedback,
    polish_final_essay_paragraphs,
)


@dataclass(frozen=True)
class NLEssayProofreadOutput:
    """Next Writing Batch 自由英作文（ESSAY_PROMPT）用フィールド構成。"""

    evaluation: str
    general_comment: str
    explanation: str
    content_comment: str
    grammar_comment: str
    content_deduction: int
    grammar_deduction: int
    final_version: str
    final_essay: str
    model_name: str
    generated_at: str


def _model_label(working_model: object) -> str:
    name = getattr(working_model, "model_name", None) or getattr(working_model, "_model", None)
    return str(name or "claude")


def _generation_response_text(response: object) -> str:
    """`.text` が例外になる（候補なし・フィルタ等）場合に parts から拾う。"""
    try:
        return (getattr(response, "text", None) or "").strip()
    except Exception:
        pass
    try:
        cands = getattr(response, "candidates", None) or []
        if not cands:
            return ""
        parts: list[str] = []
        for c in cands:
            content = getattr(c, "content", None)
            for p in getattr(content, "parts", None) or []:
                txt = getattr(p, "text", None)
                if txt:
                    parts.append(str(txt))
        return "".join(parts).strip()
    except Exception:
        return ""


def _generation_error_hint(response: object) -> str:
    try:
        cands = getattr(response, "candidates", None) or []
        if not cands:
            pr = getattr(response, "prompt_feedback", None)
            if pr is not None:
                return f"no_candidates prompt_feedback={pr!r}"
            return "no_candidates"
        fr = [getattr(c, "finish_reason", None) for c in cands]
        return f"finish_reason={fr}"
    except Exception as e:
        return f"response_meta_error:{e}"


def proofread_one(
    *,
    task_id: str,
    student_id: str,
    student_name: str,
    original_essay: str,
    question: str = "",
    multipart: bool = False,
    max_retries: int = 3,
    initial_backoff_s: float = 2.0,
) -> NLEssayProofreadOutput:
    del task_id, student_id, student_name  # メタ情報は将来ログ用。プロンプトは NL と同形式のみ。

    prompt = build_nl_essay_prompt(
        question=question, user_answer=original_essay, multipart=multipart
    )
    working_model = get_working_model()
    last_err: Optional[str] = None

    for attempt in range(max_retries):
        try:
            # 内容の指摘（①②③＋【ヒント】）と JSON が途中で切れないよう十分な出力長を確保（既定 1400 では不足しがち）
            generation_config = {
                "temperature": 0.25,
                "top_p": 0.9,
                "top_k": 20,
                "max_output_tokens": 8192,
            }
            response = working_model.generate_content(
                prompt,
                generation_config=generation_config,
            )
            raw_text = _generation_response_text(response)
            if not raw_text:
                raise ValueError(f"empty_generation:{_generation_error_hint(response)}")
            (
                evaluation,
                general_comment,
                explanation,
                final_version,
                content_comment,
                grammar_comment,
                content_deduction,
                grammar_deduction,
            ) = parse_free_writing_feedback(raw_text)

            if not (final_version or "").strip() and "採点エラー" in (evaluation or ""):
                final_version = finalize_final_version_for_display(original_essay, append_word_count=False)

            read_aloud = finalize_final_version_for_display(
                final_version or "",
                append_word_count=False,
            ).strip()
            if not read_aloud:
                read_aloud = (original_essay or "").strip()

            read_aloud = polish_final_essay_paragraphs(read_aloud, multipart=multipart)
            if not read_aloud:
                read_aloud = (original_essay or "").strip()

            if not read_aloud:
                raise ValueError("empty_read_aloud")

            fv_for_store = finalize_final_version_for_display(read_aloud, append_word_count=True)
            cd_i = max(0, int(content_deduction))
            gd_i = max(0, int(grammar_deduction))
            explanation_merged = merge_proofread_explanation_for_storage(
                body_explanation=(explanation or "").strip(),
                content_comment=(content_comment or "").strip(),
                grammar_comment=(grammar_comment or "").strip(),
                content_deduction=cd_i,
                grammar_deduction=gd_i,
            )
            grammar_synced = grammar_body_from_merged_explanation(explanation_merged)
            grammar_for_api = (
                grammar_synced if (grammar_synced or "").strip() else (grammar_comment or "").strip()
            )

            generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            return NLEssayProofreadOutput(
                evaluation=(evaluation or "").strip(),
                general_comment=(general_comment or "").strip(),
                explanation=explanation_merged,
                content_comment=(content_comment or "").strip(),
                grammar_comment=grammar_for_api,
                content_deduction=cd_i,
                grammar_deduction=gd_i,
                final_version=(fv_for_store or "").strip(),
                final_essay=read_aloud,
                model_name=_model_label(working_model),
                generated_at=generated_at,
            )
        except Exception as e:
            last_err = str(e)
            if attempt < max_retries - 1:
                time.sleep(initial_backoff_s * (2**attempt))

    raise RuntimeError(f"ai_proofread_failed: {last_err or 'unknown_error'}")
