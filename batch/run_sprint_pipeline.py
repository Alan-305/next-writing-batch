#!/usr/bin/env python3
"""
Day6: 本番想定の通し実行（Day3 → Day4）と所要時間の計測。

100件試験の例:
  python3 batch/run_sprint_pipeline.py --task-id YOUR_TASK --day3-workers 6 --day4-workers 6

部分失敗後の再実行は各スクリプトの --retry-failed / --only-day4-failed を使います。
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from typing import List


def _batch_dir() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def _project_root() -> str:
    return os.path.abspath(os.path.join(_batch_dir(), ".."))


def _run(cmd: List[str]) -> int:
    print("[pipeline] " + " ".join(cmd), flush=True)
    return subprocess.call(cmd)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Day3 then Day4 with timing")
    parser.add_argument("--task-id", default="", help="Filter both stages by taskId")
    parser.add_argument("--day3-workers", type=int, default=4)
    parser.add_argument("--day4-workers", type=int, default=6)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--skip-day3", action="store_true")
    parser.add_argument("--skip-day4", action="store_true")
    parser.add_argument(
        "--day4-allow-local-qr",
        action="store_true",
        help="run_day4_tts_qr_pdf に --allow-local-qr を渡す（GCS 無しの開発用）",
    )
    parser.add_argument(
        "--day4-disable-qr",
        action="store_true",
        help="run_day4_tts_qr_pdf に --disable-qr を渡す（QR 生成を無効化）",
    )
    parser.add_argument("--zip", action="store_true", help="Run package_task_outputs.py after Day4")
    args = parser.parse_args()

    root = _project_root()
    py = sys.executable
    os.chdir(root)

    t0 = time.perf_counter()
    rc = 0

    if not args.skip_day3:
        cmd3 = [
            py,
            os.path.join("batch", "run_day3_proofread.py"),
            "--workers",
            str(args.day3_workers),
            "--max-retries",
            str(args.max_retries),
        ]
        if args.task_id:
            cmd3 += ["--task-id", args.task_id]
        rc = _run(cmd3)
        if rc != 0:
            print(f"[pipeline] day3 exit={rc} (Day4は続行しません)")
            sys.exit(rc)

    if not args.skip_day4:
        cmd4 = [
            py,
            os.path.join("batch", "run_day4_tts_qr_pdf.py"),
            "--workers",
            str(args.day4_workers),
        ]
        if args.task_id:
            cmd4 += ["--task-id", args.task_id]
        if args.day4_allow_local_qr:
            cmd4.append("--allow-local-qr")
        if args.day4_disable_qr:
            cmd4.append("--disable-qr")
        rc = _run(cmd4)
        if rc != 0:
            print(f"[pipeline] day4 exit={rc}")

    if args.zip and args.task_id:
        cmdz = [py, os.path.join("batch", "package_task_outputs.py"), "--task-id", args.task_id]
        zrc = _run(cmdz)
        rc = rc or zrc

    elapsed = time.perf_counter() - t0
    print(f"[pipeline] total_elapsed_s={elapsed:.1f} final_exit={rc}")
    sys.exit(rc)


if __name__ == "__main__":
    main()
