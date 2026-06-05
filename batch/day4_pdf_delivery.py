"""Day4 納品 PDF の解決（ローカル / GCS / 再生成）。"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional, Tuple

from day4_gcs import download_gcs_object_to_file, pdf_gcs_object_from_rel
from day4_pdf import render_return_pdf
from nl_essay_feedback import pdf_feedback_lines_for_day4, read_aloud_essay_for_day4


def _safe_arc_segment(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return "unknown"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", t)[:120]


def zip_eligible_submission(submission: Dict[str, Any]) -> bool:
    """ZIP に含められる提出か（メタデータ上）。"""
    if str(submission.get("status") or "").strip() != "done":
        return False
    d4 = submission.get("day4") or {}
    if isinstance(d4, dict) and str(d4.get("error") or "").strip():
        return False
    if str(d4.get("pdf_path") or "").strip():
        return True
    sr = submission.get("studentRelease") or {}
    if str(sr.get("operatorApprovedAt") or "").strip():
        return True
    if str(sr.get("operatorFinalizedAt") or "").strip():
        return True
    pr = submission.get("proofread") or {}
    return bool(
        str(pr.get("evaluation") or "").strip()
        or str(pr.get("line1_feedback") or "").strip()
    )


def _resolve_rel_file(project_root: str, output_root: str, rel: str) -> Optional[str]:
    rel_norm = str(rel or "").strip().replace("\\", "/").lstrip("/")
    if not rel_norm or ".." in rel_norm.split("/"):
        return None

    candidates = [
        os.path.normpath(os.path.join(project_root, rel_norm)),
        os.path.normpath(os.path.join(output_root, rel_norm.removeprefix("output/"))),
    ]
    seen = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        if os.path.isfile(cand):
            return cand
    return None


def _pdf_dest_basename(submission: Dict[str, Any]) -> str:
    student_id = _safe_arc_segment(str(submission.get("studentId") or "student"))
    student_name = str(submission.get("studentName") or "").strip().replace(" ", "_")
    name_part = _safe_arc_segment(student_name) if student_name else ""
    sid = str(submission.get("submissionId") or "").strip()
    if name_part:
        return f"{student_id}_{name_part}.pdf"
    if sid:
        return f"{_safe_arc_segment(sid)}.pdf"
    return f"{student_id}.pdf"


def _gcs_object_for_submission(submission: Dict[str, Any]) -> Optional[str]:
    d4 = submission.get("day4") or {}
    if not isinstance(d4, dict):
        return None
    explicit = str(d4.get("pdf_gcs_object") or "").strip()
    if explicit:
        return explicit
    return pdf_gcs_object_from_rel(str(d4.get("pdf_path") or ""))


def _regenerate_pdf(
    *,
    project_root: str,
    submission: Dict[str, Any],
    dest_path: str,
    output_root: str,
) -> bool:
    read_aloud = read_aloud_essay_for_day4(submission)
    if not read_aloud:
        return False

    task_id = str(submission.get("taskId") or "").strip() or "task"
    student_name = str(submission.get("studentName") or "").strip() or "Student"
    fb1, fb2, fb3 = pdf_feedback_lines_for_day4(project_root, submission)

    qr_arg: Optional[str] = None
    d4 = submission.get("day4") or {}
    if isinstance(d4, dict):
        qr_rel = str(d4.get("qr_path") or "").strip()
        if qr_rel:
            qr_arg = _resolve_rel_file(project_root, output_root, qr_rel)

    try:
        render_return_pdf(
            pdf_path=dest_path,
            student_name=student_name,
            task_id=task_id,
            line1=fb1,
            line2=fb2,
            line3=fb3,
            final_essay=read_aloud,
            original_essay=str(submission.get("essayText") or ""),
            qr_path=qr_arg,
        )
        return os.path.isfile(dest_path)
    except Exception:
        return False


def ensure_submission_pdf_abs(
    *,
    project_root: str,
    output_root: str,
    submission: Dict[str, Any],
    work_dir: str,
) -> Tuple[Optional[str], Optional[str]]:
    """
    提出の PDF 絶対パスを返す。必要なら GCS 取得または再生成する。
    戻り値: (abs_path, skip_reason)
    """
    sid = str(submission.get("submissionId") or "").strip()
    if not zip_eligible_submission(submission):
        return None, f"{sid}(not_zip_eligible)" if sid else "(not_zip_eligible)"

    d4 = submission.get("day4") or {}
    pdf_rel = str(d4.get("pdf_path") or "").strip() if isinstance(d4, dict) else ""

    if pdf_rel:
        abs_path = _resolve_rel_file(project_root, output_root, pdf_rel)
        if abs_path:
            return abs_path, None

    os.makedirs(work_dir, exist_ok=True)
    base = _pdf_dest_basename(submission)
    dest = os.path.join(work_dir, base)

    gcs_obj = _gcs_object_for_submission(submission)
    if gcs_obj and download_gcs_object_to_file(object_name=gcs_obj, dest_path=dest):
        return dest, None

    if _regenerate_pdf(
        project_root=project_root,
        submission=submission,
        dest_path=dest,
        output_root=output_root,
    ):
        return dest, None

    if not pdf_rel:
        return None, f"{sid}(no_pdf)" if sid else "(no_pdf)"
    return None, f"{sid}(pdf_unavailable)" if sid else "(pdf_unavailable)"
