#!/usr/bin/env python3
"""
ブラウザを使わず、テスト用の pending 提出を1件 data/submissions.json に追加します。
Day3 / Day4 の試運転や、targets=0 の確認に便利です。

例:
  ./.venv/bin/python3 batch/seed_pending_submission.py --task-id 2026_spring_week1
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List


DEFAULT_ESSAY = (
    "I think learning English is very important for students today. "
    "We can read many books and talk with people from other countries. "
    "I want to practice speaking more every week."
)


from org_paths import nwb_organization_id, submissions_json


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _data_file() -> str:
    return submissions_json(_project_root())


def _ensure_data_file() -> None:
    path = _data_file()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump([], f)


def _atomic_write_json(path: str, obj: Any) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    shutil.move(tmp, path)


def _load() -> List[Dict[str, Any]]:
    _ensure_data_file()
    with open(_data_file(), "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def main() -> None:
    parser = argparse.ArgumentParser(description="Append one pending submission for local testing")
    parser.add_argument("--task-id", default="2026_spring_week1", help="taskId (must match batch --task-id)")
    parser.add_argument("--student-id", default="test_student_001", help="studentId")
    parser.add_argument("--student-name", default="テスト太郎", help="display name")
    parser.add_argument(
        "--essay",
        default="",
        help="Essay text (50–2000 chars to match web validation). Default: built-in sample.",
    )
    parser.add_argument(
        "--question",
        default="",
        help="Optional prompt text (ESSAY_PROMPT {question}); same role as teacher proofreading JSON.",
    )
    parser.add_argument(
        "--problem-id",
        default="",
        help="Optional problemId (must exist in data/task-problems/<task-id>.json when set).",
    )
    args = parser.parse_args()

    essay = (args.essay or "").strip() or DEFAULT_ESSAY
    if len(essay) < 50:
        raise SystemExit("essay must be at least 50 characters (same rule as /submit)")
    if len(essay) > 2000:
        raise SystemExit("essay must be at most 2000 characters")

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    row: Dict[str, Any] = {
        "submissionId": str(uuid.uuid4()),
        "submittedAt": now,
        "organizationId": nwb_organization_id(),
        "status": "pending",
        "taskId": args.task_id.strip(),
        "studentId": args.student_id.strip(),
        "studentName": args.student_name.strip(),
        "essayText": essay,
    }
    q = (args.question or "").strip()
    if q:
        row["question"] = q
    pid = (args.problem_id or "").strip()
    if pid:
        row["problemId"] = pid

    data = _load()
    data.insert(0, row)
    _atomic_write_json(_data_file(), data)

    rel = os.path.relpath(_data_file(), _project_root())
    print(f"[seed] appended pending submission submissionId={row['submissionId']}")
    print(f"[seed] taskId={row['taskId']} studentId={row['studentId']}")
    print(f"[seed] file={rel}")


if __name__ == "__main__":
    main()
