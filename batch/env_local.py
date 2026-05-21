"""ターミナルから batch/*.py を実行するとき、Next の .env.local を反映する。"""

from __future__ import annotations

import os
from pathlib import Path


def load_env_local(project_root: str | Path) -> None:
    path = Path(project_root) / ".env.local"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
        os.environ[key] = val


def hydrate_claude_key_from_disk(project_root: str | Path) -> None:
    if (os.environ.get("NEXT_WRITING_BATCH_KEY") or "").strip():
        return
    fp = Path(project_root) / "data" / "anthropic_api_key.txt"
    try:
        key = (fp.read_text(encoding="utf-8").splitlines()[0] or "").strip()
        if key:
            os.environ["NEXT_WRITING_BATCH_KEY"] = key
    except OSError:
        pass
