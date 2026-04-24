import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Day4Paths:
    project_root: str
    out_dir: str
    audio_dir: str
    qr_dir: str
    pdf_dir: str


def resolve_paths() -> Day4Paths:
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    out_dir = os.path.join(project_root, "output")
    audio_dir = os.path.join(out_dir, "audio")
    qr_dir = os.path.join(out_dir, "qr")
    pdf_dir = os.path.join(out_dir, "pdf")
    return Day4Paths(
        project_root=project_root,
        out_dir=out_dir,
        audio_dir=audio_dir,
        qr_dir=qr_dir,
        pdf_dir=pdf_dir,
    )


def ensure_dirs(paths: Day4Paths, task_id: str) -> Day4Paths:
    os.makedirs(os.path.join(paths.audio_dir, task_id), exist_ok=True)
    os.makedirs(os.path.join(paths.qr_dir, task_id), exist_ok=True)
    os.makedirs(os.path.join(paths.pdf_dir, task_id), exist_ok=True)
    return paths

