#!/usr/bin/env python3
"""提出 1 件の Day4 PDF 絶対パスを stdout に出力（管理画面 PDF 配信のフォールバック）。"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional

from day4_pdf_delivery import ensure_submission_pdf_abs
from org_paths import submissions_json


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _output_root(project_root: str) -> str:
    env = (os.environ.get("NWB_OUTPUT_ROOT") or "").strip()
    return env if env else os.path.join(project_root, "output")


def _load_submissions(project_root: str) -> List[Dict[str, Any]]:
    path = submissions_json(project_root)
    if not os.path.isfile(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-id", required=True)
    args = parser.parse_args()
    sid = str(args.submission_id or "").strip()
    if not sid:
        print("missing submission id", file=sys.stderr)
        return 1

    project_root = _project_root()
    output_root = _output_root(project_root)
    rows = _load_submissions(project_root)
    submission: Optional[Dict[str, Any]] = None
    for row in rows:
        if str(row.get("submissionId") or "").strip() == sid:
            submission = row
            break

    if not submission:
        print(f"submission not found: {sid}", file=sys.stderr)
        return 1

    work_dir = tempfile.mkdtemp(prefix="resolve-pdf-")
    abs_path, skip = ensure_submission_pdf_abs(
        project_root=project_root,
        output_root=output_root,
        submission=submission,
        work_dir=work_dir,
    )
    if abs_path and os.path.isfile(abs_path):
        print(abs_path)
        return 0

    print(skip or "pdf_unavailable", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
