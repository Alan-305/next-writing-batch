"""Day4 納品 PDF の解決（ローカル / GCS / 再生成）。PDF 内 QR は必須。"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional, Tuple

from day4_gcs import (
    download_gcs_object_to_file,
    pdf_gcs_object_from_rel,
    qr_gcs_object_from_rel,
    resolve_qr_audio_url_for_day4,
)
from day4_pdf import render_return_pdf
from day4_qr import make_qr_png
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


def pdf_filename_for_submission(submission: Dict[str, Any]) -> str:
    """
    人間が識別しやすい PDF ファイル名。
    例: 2026-4_111_naoki.pdf / 2026-4_400438.pdf（氏名が日本語のみのときは学籍のみ）
    """
    task = _safe_arc_segment(str(submission.get("taskId") or "task"))
    raw_student_id = str(submission.get("studentId") or "").strip()
    safe_student = _safe_arc_segment(raw_student_id) if raw_student_id else ""
    name = str(submission.get("studentName") or "").strip().replace(" ", "_")
    safe_name = _safe_arc_segment(name) if name else ""
    readable_name = safe_name.strip("_-")
    has_ascii_name = bool(re.search(r"[a-zA-Z]", readable_name))

    if safe_student and has_ascii_name:
        stem = f"{task}_{safe_student}_{readable_name}"
    elif safe_student:
        stem = f"{task}_{safe_student}"
    else:
        short_sub = _safe_arc_segment(str(submission.get("submissionId") or ""))[:8]
        stem = f"{task}_{short_sub or 'unknown'}"

    return f"{stem[:160]}.pdf"


def _gcs_object_for_submission(submission: Dict[str, Any]) -> Optional[str]:
    d4 = submission.get("day4") or {}
    if not isinstance(d4, dict):
        return None
    explicit = str(d4.get("pdf_gcs_object") or "").strip()
    if explicit:
        return explicit
    return pdf_gcs_object_from_rel(str(d4.get("pdf_path") or ""))


def _submission_wants_qr_in_pdf(submission: Dict[str, Any]) -> bool:
    d4 = submission.get("day4") or {}
    if not isinstance(d4, dict):
        return False
    return bool(
        str(d4.get("qr_path") or "").strip()
        or str(d4.get("audio_url") or "").strip()
        or str(d4.get("audio_path") or "").strip()
    )


def _ensure_qr_png_for_submission(
    *,
    submission: Dict[str, Any],
    project_root: str,
    output_root: str,
    work_dir: str,
) -> Optional[str]:
    """PDF 埋め込み用 QR PNG。ローカル → GCS → audio_url から再生成。"""
    d4 = submission.get("day4") or {}
    if not isinstance(d4, dict):
        return None

    qr_rel = str(d4.get("qr_path") or "").strip()
    if qr_rel:
        local = _resolve_rel_file(project_root, output_root, qr_rel)
        if local:
            return local

    os.makedirs(work_dir, exist_ok=True)
    dest = os.path.join(work_dir, "qr.png")

    gcs_obj = str(d4.get("qr_gcs_object") or "").strip()
    if not gcs_obj and qr_rel:
        gcs_obj = qr_gcs_object_from_rel(qr_rel) or ""
    if gcs_obj and download_gcs_object_to_file(object_name=gcs_obj, dest_path=dest):
        return dest

    task_id = str(submission.get("taskId") or "").strip()
    qr_url = resolve_qr_audio_url_for_day4(
        audio_url=str(d4.get("audio_url") or ""),
        task_id=task_id,
        audio_path=str(d4.get("audio_path") or ""),
    )
    if not qr_url:
        return None

    return make_qr_png(url=qr_url, out_path=dest)


def _regenerate_pdf(
    *,
    project_root: str,
    submission: Dict[str, Any],
    dest_path: str,
    output_root: str,
    work_dir: str,
) -> bool:
    read_aloud = read_aloud_essay_for_day4(submission)
    if not read_aloud:
        return False

    task_id = str(submission.get("taskId") or "").strip() or "task"
    student_name = str(submission.get("studentName") or "").strip() or "Student"
    fb1, fb2, fb3 = pdf_feedback_lines_for_day4(project_root, submission)

    qr_arg: Optional[str] = None
    if _submission_wants_qr_in_pdf(submission):
        qr_arg = _ensure_qr_png_for_submission(
            submission=submission,
            project_root=project_root,
            output_root=output_root,
            work_dir=os.path.join(work_dir, "qr"),
        )

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
    QR 付き PDF が期待される場合は、GCS の古い PDF より再生成を優先する。
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
    base = pdf_filename_for_submission(submission)
    dest = os.path.join(work_dir, base)

    wants_qr = _submission_wants_qr_in_pdf(submission)
    if wants_qr and _regenerate_pdf(
        project_root=project_root,
        submission=submission,
        dest_path=dest,
        output_root=output_root,
        work_dir=work_dir,
    ):
        return dest, None

    gcs_obj = _gcs_object_for_submission(submission)
    if gcs_obj and download_gcs_object_to_file(object_name=gcs_obj, dest_path=dest):
        return dest, None

    if _regenerate_pdf(
        project_root=project_root,
        submission=submission,
        dest_path=dest,
        output_root=output_root,
        work_dir=work_dir,
    ):
        return dest, None

    if not pdf_rel:
        return None, f"{sid}(no_pdf)" if sid else "(no_pdf)"
    return None, f"{sid}(pdf_unavailable)" if sid else "(pdf_unavailable)"
