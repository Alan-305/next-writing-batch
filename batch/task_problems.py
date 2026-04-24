"""
taskId ごとの課題マスタ（data/task-problems/{taskId}.json）を読み、
提出の problemId に対応する課題文（question）を解決する。
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional


def _safe_task_file_stem(task_id: str) -> str:
    t = (task_id or "").strip()
    if not t:
        return "unknown"
    return re.sub(r"[^a-zA-Z0-9._-]", "_", t)


def load_task_master(project_root: str, task_id: str) -> Optional[Dict[str, Any]]:
    stem = _safe_task_file_stem(task_id)
    path = os.path.join(project_root, "data", "task-problems", f"{stem}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _question_from_master(master: Dict[str, Any], problem_id: str) -> str:
    pid = (problem_id or "").strip()
    if not pid:
        return ""
    probs = master.get("problems")
    if not isinstance(probs, list):
        return ""
    for p in probs:
        if not isinstance(p, dict):
            continue
        if str(p.get("problemId") or "").strip() == pid:
            return str(p.get("question") or "").strip()
    return ""


def resolve_proofreading_question(project_root: str, submission: Dict[str, Any]) -> str:
    """
    problemId があればマスタ必須。無ければ submission['question']（従来）をそのまま返す。
    """
    pid = str(submission.get("problemId") or "").strip()
    tid = str(submission.get("taskId") or "").strip()
    legacy_q = str(submission.get("question") or "").strip()

    if pid:
        master = load_task_master(project_root, tid)
        if not master:
            raise ValueError(f"task_master_missing:{tid}")
        q = _question_from_master(master, pid)
        if not q:
            raise ValueError(f"problem_not_in_master:{pid}")
        return q
    return legacy_q
