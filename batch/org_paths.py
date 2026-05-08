"""マルチテナント: `data/orgs/{NWB_ORGANIZATION_ID}/` 配下のパス（既定 default）。"""

from __future__ import annotations

import os
import re
from typing import Final


def _orgs_base_dir(project_root: str) -> str:
    base = (os.environ.get("NWB_DATA_ROOT") or "").strip()
    if not base:
        return os.path.join(project_root, "data", "orgs")
    return os.path.join(base, "orgs")


def nwb_organization_id() -> str:
    raw = (os.environ.get("NWB_ORGANIZATION_ID") or "default").strip()
    if not raw:
        return "default"
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:64]
    return safe or "default"


def submissions_json(project_root: str) -> str:
    oid = nwb_organization_id()
    return os.path.join(_orgs_base_dir(project_root), oid, "submissions.json")


def task_problems_dir(project_root: str) -> str:
    oid = nwb_organization_id()
    return os.path.join(_orgs_base_dir(project_root), oid, "task-problems")
