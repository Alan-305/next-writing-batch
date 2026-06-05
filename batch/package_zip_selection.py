"""
納品 ZIP: Day4 済み提出の **PDF のみ** をまとめる。
- --by-task: 課題IDに属する提出から PDF を収集
- --by-submissions: 受付IDを指定して PDF を収集

ローカルに無い PDF は GCS から取得し、それでも無ければ提出データから再生成する。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import tempfile
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from day4_pdf_delivery import ensure_submission_pdf_abs, pdf_filename_for_submission, zip_eligible_submission
from org_paths import submissions_json


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _output_root(project_root: str) -> str:
    env = (os.environ.get("NWB_OUTPUT_ROOT") or "").strip()
    return env if env else os.path.join(project_root, "output")


def _data_file(project_root: str) -> str:
    return submissions_json(project_root)


def _load_submissions(project_root: str) -> List[Dict[str, Any]]:
    path = _data_file(project_root)
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _safe_arc_segment(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return "unknown"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", t)[:120]


def _student_label_for_filename(submission: Dict[str, Any]) -> str:
    """ZIP ファイル名用の生徒ラベル（学籍番号優先、英字氏名があれば併記）。"""
    sid = str(submission.get("studentId") or "").strip()
    name = str(submission.get("studentName") or "").strip()
    safe_sid = _safe_arc_segment(sid) if sid else ""
    safe_name = _safe_arc_segment(name) if name else ""
    readable_name = safe_name.strip("_-")
    if readable_name and not readable_name.replace("_", "").isdigit():
        if safe_sid and safe_sid != readable_name:
            return f"{safe_sid}-{readable_name}"[:48]
        return readable_name[:48]
    if safe_sid:
        return safe_sid[:48]
    return _safe_arc_segment(str(submission.get("submissionId") or ""))[:24] or "student"


def _unique_ordered(items: List[str]) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    for x in items:
        if not x or x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def _truncate_zip_stem(stem: str, *, max_len: int = 176) -> str:
    if len(stem) <= max_len:
        return stem
    return stem[:max_len].rstrip("_-.")


def _build_zip_out_name(
    submissions: List[Dict[str, Any]],
    *,
    mode: str,
    pdf_count: int,
    task_id: str = "",
) -> str:
    """
    納品 ZIP のファイル名を組み立てる。
    例: 2026-4_111-222_2pdfs_20260605_143022.pdf.zip
        2026-4_20pdfs_20260605_143022.pdf.zip（課題まとめ）
    """
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    count_part = f"{max(0, pdf_count)}pdfs"

    task_ids = _unique_ordered(
        [str(s.get("taskId") or "").strip() for s in submissions if str(s.get("taskId") or "").strip()]
    )
    if mode == "task" and task_id.strip():
        task_part = _safe_arc_segment(task_id.strip())
    elif len(task_ids) == 1:
        task_part = _safe_arc_segment(task_ids[0])
    elif len(task_ids) > 1:
        task_part = f"tasks-{len(task_ids)}"
    else:
        task_part = "no-task"

    labels = _unique_ordered([_student_label_for_filename(s) for s in submissions])

    if mode == "task":
        # 課題単位は件数が多くなりがちなので生徒名は省略
        stem = f"{task_part}_{count_part}_{stamp}"
    else:
        max_labels = 4
        if len(labels) <= max_labels:
            students_part = "-".join(labels) if labels else "students"
        elif labels:
            students_part = "-".join(labels[:3]) + f"-他{len(labels) - 3}"
        else:
            students_part = "students"
        stem = f"{task_part}_{students_part}_{count_part}_{stamp}"

    return f"{_truncate_zip_stem(stem)}.pdf.zip"


def _pdf_pairs_from_submissions(
    project_root: str,
    submissions: List[Dict[str, Any]],
    work_dir: str,
) -> Tuple[List[Tuple[str, str]], List[str]]:
    pairs: List[Tuple[str, str]] = []
    missing: List[str] = []
    output_root = _output_root(project_root)

    for s in submissions:
        sid = str(s.get("submissionId") or "").strip()
        if not sid:
            continue

        abs_path, skip = ensure_submission_pdf_abs(
            project_root=project_root,
            output_root=output_root,
            submission=s,
            work_dir=os.path.join(work_dir, sid),
        )
        if not abs_path:
            missing.append(skip or f"{sid}(pdf_unavailable)")
            continue

        arc = pdf_filename_for_submission(s)
        pairs.append((abs_path, arc))

    return pairs, missing


def _write_zip(project_root: str, out_name: str, pairs: List[Tuple[str, str]], missing: List[str]) -> str:
    if not pairs:
        detail = ", ".join(missing[:20]) + (" ..." if len(missing) > 20 else "")
        raise SystemExit(
            "ZIP に入れる PDF がありません。添削確定・Day4 済みの提出を選ぶか、"
            "該当提出の Day4 を再実行してください。"
            + (f" detail: {detail}" if detail else "")
        )

    zips_dir = os.path.join(_output_root(project_root), "zips")
    os.makedirs(zips_dir, exist_ok=True)
    out_path = os.path.join(zips_dir, out_name)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for abs_path, arc in pairs:
            zf.write(abs_path, arcname=arc)

    rel = os.path.relpath(out_path, project_root)
    print(f"[zip] wrote: {out_path}")
    print(f"[zip] rel:   {rel}")
    print(f"[zip] pdf entries: {len(pairs)}")
    if missing:
        print(f"[zip] skipped: {', '.join(missing[:30])}" + (" ..." if len(missing) > 30 else ""))
    return out_path


def _zip_by_submissions(project_root: str, submission_ids: List[str]) -> str:
    ids = [x.strip() for x in submission_ids if x and str(x).strip()]
    if not ids:
        raise SystemExit("no submission ids")

    seen: Set[str] = set()
    unique: List[str] = []
    for x in ids:
        if x in seen:
            continue
        seen.add(x)
        unique.append(x)

    rows = _load_submissions(project_root)
    by_id: Dict[str, Dict[str, Any]] = {}
    for s in rows:
        sid = str(s.get("submissionId") or "").strip()
        if sid:
            by_id[sid] = s

    selected: List[Dict[str, Any]] = []
    for sid in unique:
        s = by_id.get(sid)
        if s:
            selected.append(s)

    zips_parent = os.path.join(_output_root(project_root), "zips")
    os.makedirs(zips_parent, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="zip_sel_", dir=zips_parent)
    try:
        pairs, missing = _pdf_pairs_from_submissions(project_root, selected, work_dir)
        for sid in unique:
            if sid not in by_id:
                missing.append(f"{sid}(not_found)")
        out_name = _build_zip_out_name(
            selected,
            mode="selection",
            pdf_count=len(pairs),
        )
        return _write_zip(project_root, out_name, pairs, missing)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def _zip_by_task(project_root: str, task_id: str) -> str:
    tid = (task_id or "").strip()
    if not tid:
        raise SystemExit("task id required")

    rows = _load_submissions(project_root)
    matched = [s for s in rows if str(s.get("taskId") or "").strip() == tid]
    if not matched:
        raise SystemExit(f"no submissions found for taskId={tid}")

    eligible = [s for s in matched if zip_eligible_submission(s)]
    if not eligible:
        raise SystemExit(f"no zip-eligible submissions for taskId={tid}")

    zips_parent = os.path.join(_output_root(project_root), "zips")
    os.makedirs(zips_parent, exist_ok=True)
    work_dir = tempfile.mkdtemp(prefix="zip_task_", dir=zips_parent)
    try:
        pairs, missing = _pdf_pairs_from_submissions(project_root, eligible, work_dir)
        out_name = _build_zip_out_name(
            eligible,
            mode="task",
            pdf_count=len(pairs),
            task_id=tid,
        )
        return _write_zip(project_root, out_name, pairs, missing)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Package deliverable zip (PDF only) by task or submission ids")
    parser.add_argument("--by-task", dest="task_id", default="", help="Zip all Day4 PDFs for this taskId")
    parser.add_argument(
        "--by-submissions",
        dest="submission_ids",
        default="",
        help="Comma-separated submissionIds (Day4 PDFs)",
    )
    args = parser.parse_args()

    task_id = str(args.task_id or "").strip()
    raw_ids = str(args.submission_ids or "").strip()

    if bool(task_id) == bool(raw_ids):
        raise SystemExit("specify exactly one of: --by-task TASK_ID  OR  --by-submissions id1,id2,...")

    project_root = _project_root()

    if task_id:
        _zip_by_task(project_root, task_id)
        return

    ids = [x.strip() for x in raw_ids.split(",") if x.strip()]
    _zip_by_submissions(project_root, ids)


if __name__ == "__main__":
    main()
