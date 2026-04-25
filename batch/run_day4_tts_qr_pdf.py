import argparse
import json
import os
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from day4_assets import ensure_dirs, resolve_paths
from day4_pdf import render_return_pdf
from day4_qr import make_qr_png
from day4_tts_local import synthesize_mp3_to_path

from day4_gcs import upload_mp3_and_get_signed_url

from nl_essay_feedback import pdf_feedback_lines_for_day4, read_aloud_essay_for_day4


def _data_file(project_root: str) -> str:
    return os.path.join(project_root, "data", "submissions.json")


def _ensure_data_file(project_root: str) -> None:
    df = _data_file(project_root)
    os.makedirs(os.path.dirname(df), exist_ok=True)
    if not os.path.exists(df):
        with open(df, "w", encoding="utf-8") as f:
            json.dump([], f)


def _atomic_write_json(path: str, obj: Any) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    shutil.move(tmp, path)


def _load_submissions_unlocked(project_root: str) -> List[Dict[str, Any]]:
    _ensure_data_file(project_root)
    with open(_data_file(project_root), "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _save_submissions_unlocked(project_root: str, submissions: List[Dict[str, Any]]) -> None:
    _atomic_write_json(_data_file(project_root), submissions)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _signed_url_or_local(*, local_audio_url: str) -> str:
    return local_audio_url


def _friendly_day4_error(err: str) -> str:
    e = (err or "").strip()
    if e.startswith("missing_env:"):
        return (
            "必要な環境変数が不足しています（GCS_BUCKET_NAME と GOOGLE_APPLICATION_CREDENTIALS など）。"
            "ローカル開発のみ --allow-local-qr で相対URLのQRを許可できます。"
        )
    if "tts_failed" in e:
        return "音声合成（TTS）に失敗しました。ネットワークと gTTS、入力テキストを確認してください。"
    if "qr_failed" in e:
        return "QR画像の生成に失敗しました。"
    if "403" in e or "401" in e:
        return "クラウドストレージの認可に失敗しました。サービスアカウント権限を確認してください。"
    return "Day4（音声/アップロード/QR/PDF）でエラーが発生しました。ログを確認し、失敗分のみ再実行してください。"


def _pick_day4_indices(
    submissions: List[Dict[str, Any]],
    *,
    task_id: str,
    id_filter: Optional[Set[str]],
    force: bool,
    only_day4_failed: bool,
) -> List[int]:
    targets: List[int] = []
    for idx, s in enumerate(submissions):
        if (s.get("status") or "") != "done":
            continue
        if task_id and (s.get("taskId") or "") != task_id:
            continue
        sid = str(s.get("submissionId") or "")
        if id_filter is not None and sid not in id_filter:
            continue
        if not read_aloud_essay_for_day4(s):
            continue

        d4 = s.get("day4") or {}
        has_ok = bool(d4.get("pdf_path")) and not d4.get("error")

        if only_day4_failed:
            if d4.get("error"):
                targets.append(idx)
                continue
            if not d4.get("pdf_path"):
                targets.append(idx)
                continue
            continue

        if has_ok and not force:
            continue
        targets.append(idx)
    return targets


def main() -> None:
    parser = argparse.ArgumentParser(description="Day4: TTS + GCS + QR + PDF")
    parser.add_argument("--task-id", default="", help="Only process this taskId (optional)")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N records (0 = no limit)")
    parser.add_argument(
        "--audio-base-url",
        default=os.environ.get("AUDIO_BASE_URL", ""),
        help="--allow-local-qr 時のみ: QRに埋め込むベースURL（env AUDIO_BASE_URL）",
    )
    parser.add_argument(
        "--allow-local-qr",
        action="store_true",
        help="GCS_BUCKET_NAME が無いときでもローカル/相対URLのQRを許可（開発用。本番はGCS必須）",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Parallel workers. Suggested 4-8 for 100件（I/O中心）。",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="既にPDFまで成功しているレコードも再生成する",
    )
    parser.add_argument(
        "--only-day4-failed",
        action="store_true",
        help="Day4が未完了（pdf無し）または day4.error があるレコードだけ",
    )
    parser.add_argument(
        "--submission-ids",
        default="",
        help="カンマ区切り submissionId に絞る",
    )
    parser.add_argument(
        "--disable-qr",
        action="store_true",
        help="QR画像を生成しない（将来の復帰用に機能は保持したまま無効化）",
    )
    args = parser.parse_args()

    if not os.environ.get("GCS_BUCKET_NAME", "").strip() and not args.allow_local_qr:
        print(
            "[day4] GCS_BUCKET_NAME が未設定です。署名付きURLのQRには GCS を設定するか、"
            "開発時のみ --allow-local-qr を付けてください。"
        )
    elif not os.environ.get("GCS_BUCKET_NAME", "").strip() and args.allow_local_qr:
        has_base = bool((args.audio_base_url or "").strip() or os.environ.get("AUDIO_BASE_URL", "").strip())
        if not has_base:
            print(
                "[day4] warning: --allow-local-qr かつ AUDIO_BASE_URL も無いため、QR は相対パスです。"
            )

    id_filter: Optional[Set[str]] = None
    if (args.submission_ids or "").strip():
        id_filter = {x.strip() for x in args.submission_ids.split(",") if x.strip()}

    paths = resolve_paths()
    store_lock = threading.Lock()
    submissions = _load_submissions_unlocked(paths.project_root)

    targets = _pick_day4_indices(
        submissions,
        task_id=str(args.task_id or ""),
        id_filter=id_filter,
        force=bool(args.force),
        only_day4_failed=bool(args.only_day4_failed),
    )

    if args.limit and args.limit > 0:
        targets = targets[: args.limit]

    total = len(targets)
    print(
        f"[day4] targets={total} workers={args.workers} force={args.force} "
        f"only_day4_failed={args.only_day4_failed}"
    )
    if total == 0:
        print(
            "[day4] hint: 対象がありません。taskId が提出と一致しているか、"
            "Day3 済み(status=done)で読み上げ用英文があるか（運用「確定」または公開済みなら studentRelease.finalText）、"
            "既に PDF 成功で --force が要るかを確認してください。"
        )
        return

    rendered = 0
    failed = 0
    t0 = time.perf_counter()

    def run_one(idx: int) -> Tuple[str, int, str]:
        with store_lock:
            data = _load_submissions_unlocked(paths.project_root)
            s = data[idx]
            task_id = str(s.get("taskId") or "task")
            student_id = str(s.get("studentId") or "student")
            student_name = str(s.get("studentName") or "")
        read_aloud = read_aloud_essay_for_day4(s)

        ensure_dirs(paths, task_id)

        try:
            mp3_filename = f"{student_id}.mp3"
            mp3_path = os.path.join(paths.audio_dir, task_id, mp3_filename)
            mp3 = synthesize_mp3_to_path(text=read_aloud, out_path=mp3_path)
            if not mp3:
                raise RuntimeError("tts_failed")

            gcs_bucket = os.environ.get("GCS_BUCKET_NAME", "").strip()
            if gcs_bucket:
                expires_days = int(os.environ.get("GCS_SIGNED_URL_EXPIRE_DAYS", "180").strip() or "180")
                object_name = f"audio/{task_id}/{mp3_filename}"
                audio_url = upload_mp3_and_get_signed_url(
                    local_path=mp3_path,
                    object_name=object_name,
                    expires_days=expires_days,
                )
            elif args.allow_local_qr:
                base = (args.audio_base_url or "").rstrip("/")
                if not base:
                    audio_url = f"/output/audio/{task_id}/{mp3_filename}"
                else:
                    audio_url = f"{base}/output/audio/{task_id}/{mp3_filename}"
            else:
                raise RuntimeError("missing_env:GCS_BUCKET_NAME")

            audio_url = _signed_url_or_local(local_audio_url=audio_url)

            qr_rel: Optional[str] = None
            qr_arg: Optional[str] = None
            if not args.disable_qr:
                qr_path = os.path.join(paths.qr_dir, task_id, f"{student_id}.png")
                qr = make_qr_png(url=audio_url, out_path=qr_path)
                if not qr:
                    raise RuntimeError("qr_failed")
                qr_rel = os.path.relpath(qr_path, paths.project_root)
                qr_arg = qr

            pdf_path = os.path.join(
                paths.pdf_dir, task_id, f"{student_id}_{student_name}.pdf".replace(" ", "_")
            )
            fb1, fb2, fb3 = pdf_feedback_lines_for_day4(paths.project_root, s)

            render_return_pdf(
                pdf_path=pdf_path,
                student_name=student_name,
                task_id=task_id,
                line1=fb1,
                line2=fb2,
                line3=fb3,
                final_essay=read_aloud,
                original_essay=str(s.get("essayText") or ""),
                qr_path=qr_arg,
            )

            with store_lock:
                data = _load_submissions_unlocked(paths.project_root)
                s = data[idx]
                s["day4"] = {
                    "audio_path": os.path.relpath(mp3_path, paths.project_root),
                    "audio_url": audio_url,
                    "pdf_path": os.path.relpath(pdf_path, paths.project_root),
                    "generatedAt": _now_iso(),
                }
                if qr_rel:
                    s["day4"]["qr_path"] = qr_rel
                else:
                    s["day4"].pop("qr_path", None)
                s["day4"].pop("error", None)
                s["day4"].pop("operator_message", None)
                data[idx] = s
                _save_submissions_unlocked(paths.project_root, data)

            return ("ok", idx, student_id)
        except Exception as e:
            raw = str(e)
            friendly = _friendly_day4_error(raw)
            with store_lock:
                data = _load_submissions_unlocked(paths.project_root)
                s = data[idx]
                s["day4"] = {
                    "error": raw,
                    "operator_message": friendly,
                    "generatedAt": _now_iso(),
                }
                data[idx] = s
                _save_submissions_unlocked(paths.project_root, data)
            return ("fail", idx, f"{student_id}: {friendly}")

    workers = max(1, int(args.workers))
    done_n = 0
    if workers == 1:
        for idx in targets:
            tag, _, detail = run_one(idx)
            done_n += 1
            if tag == "ok":
                rendered += 1
            else:
                failed += 1
            elapsed = time.perf_counter() - t0
            remain = total - done_n
            print(
                f"[day4] {done_n}/{total} ok={rendered} failed={failed} remain={remain} "
                f"elapsed_s={elapsed:.1f} last={detail}"
            )
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(run_one, idx): idx for idx in targets}
            for fut in as_completed(futs):
                tag, _, detail = fut.result()
                done_n += 1
                if tag == "ok":
                    rendered += 1
                else:
                    failed += 1
                elapsed = time.perf_counter() - t0
                remain = total - done_n
                print(
                    f"[day4] {done_n}/{total} ok={rendered} failed={failed} remain={remain} "
                    f"elapsed_s={elapsed:.1f} last={detail}"
                )

    elapsed = time.perf_counter() - t0
    print(f"[day4] finished rendered={rendered} failed={failed} total_s={elapsed:.1f}")


if __name__ == "__main__":
    main()
