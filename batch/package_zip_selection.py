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

from day4_pdf_delivery import ensure_submission_pdf_abs, zip_eligible_submission
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

        task_id = _safe_arc_segment(str(s.get("taskId") or "task"))
        student = _safe_arc_segment(str(s.get("studentName") or s.get("studentId") or sid))
        base = os.path.basename(abs_path)
        arc = f"{task_id}/{student}_{base}"
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
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_name = f"selection_{stamp}_{len(unique)}subs.pdf.zip"
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
        safe_tid = _safe_arc_segment(tid)
        out_name = f"{safe_tid}.pdf.zip"
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
