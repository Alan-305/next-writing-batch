import argparse
import os
import zipfile
from typing import Iterable, List, Tuple


def _walk_files(root: str) -> Iterable[Tuple[str, str]]:
    """
    Yield (abs_path, arcname) pairs for all files under root.
    arcname is posix-style relative path from root.
    """
    for dirpath, _, filenames in os.walk(root):
        for fn in filenames:
            abs_path = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_path, root)
            arcname = rel.replace(os.sep, "/")
            yield abs_path, arcname


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Zip Day4 outputs for a taskId (audio/qr/pdf under output/)"
    )
    parser.add_argument(
        "--task-id",
        required=True,
        help="taskId (same as Day4; folders output/audio/<id>, qr, pdf)",
    )
    parser.add_argument(
        "--out",
        default="",
        help="Output zip path (default: output/zips/{taskId}.zip)",
    )
    args = parser.parse_args()

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    task_id = str(args.task_id).replace(os.sep, "_").replace("/", "_")

    # Day4 writes to output/{audio,qr,pdf}/<taskId>/ — not output/<taskId>/
    roots: List[Tuple[str, str]] = [
        (os.path.join(project_root, "output", "audio", task_id), "audio"),
        (os.path.join(project_root, "output", "qr", task_id), "qr"),
        (os.path.join(project_root, "output", "pdf", task_id), "pdf"),
    ]
    existing = [(path, kind) for path, kind in roots if os.path.isdir(path)]
    if not existing:
        raise SystemExit(
            "no output folders found for this taskId. Expected at least one of:\n"
            f"  {roots[0][0]}\n  {roots[1][0]}\n  {roots[2][0]}\n"
            "Run batch/run_day4_tts_qr_pdf.py for this task first."
        )

    out_path = args.out.strip()
    if not out_path:
        zips_dir = os.path.join(project_root, "output", "zips")
        os.makedirs(zips_dir, exist_ok=True)
        out_path = os.path.join(zips_dir, f"{task_id}.zip")
    else:
        parent = os.path.dirname(os.path.abspath(out_path))
        if parent:
            os.makedirs(parent, exist_ok=True)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for base_dir, kind in existing:
            for abs_path, rel in _walk_files(base_dir):
                zf.write(
                    abs_path,
                    arcname=f"{task_id}/{kind}/{rel}",
                )

    rel = os.path.relpath(out_path, project_root)
    print(f"[zip] wrote: {out_path}")
    print(f"[zip] rel:   {rel}")
    print(f"[zip] included: {', '.join(k for _, k in existing)}")


if __name__ == "__main__":
    main()
