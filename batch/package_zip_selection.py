"""
納品 ZIP: (1) 課題ID単位は package_task_outputs.py に委譲
         (2) 受付ID複数は各提出の day4（pdf/audio/qr）をまとめる
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from org_paths import submissions_json


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _data_file(project_root: str) -> str:
    return submissions_json(project_root)


def _load_submissions(project_root: str) -> List[Dict[str, Any]]:
    path = _data_file(project_root)
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _run_package_task_outputs(project_root: str, task_id: str) -> None:
    py = sys.executable
    script = os.path.join(os.path.dirname(__file__), "package_task_outputs.py")
    subprocess.check_call([py, script, "--task-id", task_id], cwd=project_root)


def _safe_arc_segment(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return "unknown"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", t)[:120]


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

    pairs: List[Tuple[str, str, str]] = []
    missing: List[str] = []
    for sid in unique:
        s = by_id.get(sid)
        if not s:
            missing.append(f"{sid}(not_found)")
            continue
        d4 = s.get("day4") or {}
        if not isinstance(d4, dict):
            missing.append(f"{sid}(no_day4)")
            continue
        if str(d4.get("error") or "").strip():
            missing.append(f"{sid}(day4_error)")
            continue
        added = 0
        for key, kind in (("pdf_path", "pdf"), ("audio_path", "audio"), ("qr_path", "qr")):
            rel = str(d4.get(key) or "").strip().replace("\\", "/").lstrip("/")
            if not rel:
                continue
            abs_path = os.path.normpath(os.path.join(project_root, rel))
            if not abs_path.startswith(os.path.normpath(project_root)):
                continue
            if os.path.isfile(abs_path):
                arc = f"{_safe_arc_segment(sid)}/{kind}/{os.path.basename(abs_path)}"
                pairs.append((abs_path, arc))
                added += 1
        if added == 0:
            missing.append(f"{sid}(no_files)")

    if not pairs:
        raise SystemExit(
            "no files to zip. submissions need day4 pdf/audio/qr paths. detail: " + ", ".join(missing[:20])
        )

    zips_dir = os.path.join(project_root, "output", "zips")
    os.makedirs(zips_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_name = f"selection_{stamp}_{len(unique)}subs.zip"
    out_path = os.path.join(zips_dir, out_name)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for abs_path, arc in pairs:
            zf.write(abs_path, arcname=arc)

    rel = os.path.relpath(out_path, project_root)
    print(f"[zip] wrote: {out_path}")
    print(f"[zip] rel:   {rel}")
    print(f"[zip] entries: {len(pairs)}")
    if missing:
        print(f"[zip] skipped: {', '.join(missing[:30])}" + (" ..." if len(missing) > 30 else ""))
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Package deliverable zip by task or by submission ids")
    parser.add_argument("--by-task", dest="task_id", default="", help="Same as package_task_outputs.py --task-id")
    parser.add_argument(
        "--by-submissions",
        dest="submission_ids",
        default="",
        help="Comma-separated submissionIds (day4 assets)",
    )
    args = parser.parse_args()

    task_id = str(args.task_id or "").strip()
    raw_ids = str(args.submission_ids or "").strip()

    if bool(task_id) == bool(raw_ids):
        raise SystemExit("specify exactly one of: --by-task TASK_ID  OR  --by-submissions id1,id2,...")

    project_root = _project_root()

    if task_id:
        _run_package_task_outputs(project_root, task_id)
        return

    ids = [x.strip() for x in raw_ids.split(",") if x.strip()]
    _zip_by_submissions(project_root, ids)


if __name__ == "__main__":
    main()
