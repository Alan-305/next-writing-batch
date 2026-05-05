"""マルチテナント: `data/orgs/{NWB_ORGANIZATION_ID}/` 配下のパス（既定 default）。"""

from __future__ import annotations

import os
import re
from typing import Final


def nwb_organization_id() -> str:
    raw = (os.environ.get("NWB_ORGANIZATION_ID") or "default").strip()
    if not raw:
        return "default"
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:64]
    return safe or "default"


def submissions_json(project_root: str) -> str:
    oid = nwb_organization_id()
    return os.path.join(project_root, "data", "orgs", oid, "submissions.json")


def task_problems_dir(project_root: str) -> str:
    oid = nwb_organization_id()
    return os.path.join(project_root, "data", "orgs", oid, "task-problems")
