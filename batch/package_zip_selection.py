"""
納品 ZIP: Day4 済み提出の **PDF のみ** をまとめる。
- --by-task: 課題IDに属する提出から pdf_path を収集
- --by-submissions: 受付IDを指定して pdf_path を収集

ローカル output は NWB_OUTPUT_ROOT（Cloud Run では /tmp/...）を参照する。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

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


def _resolve_rel_file(project_root: str, rel: str) -> Optional[str]:
    rel_norm = str(rel or "").strip().replace("\\", "/").lstrip("/")
    if not rel_norm or ".." in rel_norm.split("/"):
        return None

    out_root = _output_root(project_root)
    candidates = [
        os.path.normpath(os.path.join(project_root, rel_norm)),
        os.path.normpath(os.path.join(out_root, rel_norm.removeprefix("output/"))),
    ]
    seen: Set[str] = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        if os.path.isfile(cand):
            return cand
    return None


def _pdf_pairs_from_submissions(
    project_root: str,
    submissions: List[Dict[str, Any]],
) -> Tuple[List[Tuple[str, str]], List[str]]:
    pairs: List[Tuple[str, str]] = []
    missing: List[str] = []

    for s in submissions:
        sid = str(s.get("submissionId") or "").strip()
        if not sid:
            continue
        d4 = s.get("day4") or {}
        if not isinstance(d4, dict):
            missing.append(f"{sid}(no_day4)")
            continue
        if str(d4.get("error") or "").strip():
            missing.append(f"{sid}(day4_error)")
            continue

        pdf_rel = str(d4.get("pdf_path") or "").strip()
        if not pdf_rel:
            missing.append(f"{sid}(no_pdf)")
            continue

        abs_path = _resolve_rel_file(project_root, pdf_rel)
        if not abs_path:
            missing.append(f"{sid}(pdf_missing_on_disk)")
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
            "ZIP に入れる PDF がありません。Day4 確定後、PDF がサーバー上に残っているか確認してください。"
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

    pairs, missing = _pdf_pairs_from_submissions(project_root, selected)
    for sid in unique:
        if sid not in by_id:
            missing.append(f"{sid}(not_found)")

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_name = f"selection_{stamp}_{len(unique)}subs.pdf.zip"
    return _write_zip(project_root, out_name, pairs, missing)


def _zip_by_task(project_root: str, task_id: str) -> str:
    tid = (task_id or "").strip()
    if not tid:
        raise SystemExit("task id required")

    rows = _load_submissions(project_root)
    matched = [s for s in rows if str(s.get("taskId") or "").strip() == tid]
    if not matched:
        raise SystemExit(f"no submissions found for taskId={tid}")

    pairs, missing = _pdf_pairs_from_submissions(project_root, matched)
    safe_tid = _safe_arc_segment(tid)
    out_name = f"{safe_tid}.pdf.zip"
    return _write_zip(project_root, out_name, pairs, missing)


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
