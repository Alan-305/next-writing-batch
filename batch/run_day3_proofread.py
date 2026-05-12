import argparse
import json
import os
import shutil
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _hydrate_claude_key_from_disk() -> None:
    """Next 運用画面で保存した data/anthropic_api_key.txt を、ターミナルバッチでも使えるようにする。"""
    if (os.environ.get("NEXT_WRITING_BATCH_KEY") or "").strip():
        return
    fp = os.path.join(_project_root(), "data", "anthropic_api_key.txt")
    try:
        with open(fp, "r", encoding="utf-8") as f:
            key = (f.readline() or "").strip()
        if key:
            os.environ["NEXT_WRITING_BATCH_KEY"] = key
    except OSError:
        pass


_hydrate_claude_key_from_disk()

from org_paths import submissions_json

from gemini_proofread import proofread_one
from task_problems import resolve_proofreading_question


def _data_file() -> str:
    return submissions_json(_project_root())


def _ensure_data_file() -> None:
    df = _data_file()
    os.makedirs(os.path.dirname(df), exist_ok=True)
    if not os.path.exists(df):
        with open(df, "w", encoding="utf-8") as f:
            json.dump([], f)


def _atomic_write_json(path: str, obj: Any) -> None:
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    shutil.move(tmp, path)


def _load_submissions_unlocked() -> List[Dict[str, Any]]:
    _ensure_data_file()
    with open(_data_file(), "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    return data


def _save_submissions_unlocked(submissions: List[Dict[str, Any]]) -> None:
    _atomic_write_json(_data_file(), submissions)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _friendly_proofread_error(err: str) -> str:
    """運用者向けに短く寄せる（詳細はログ用にそのまま残す）。"""
    e = (err or "").strip()
    if "missing_env:NEXT_WRITING_BATCH_KEY" in e:
        return (
            "Claude API キーが未設定です。.env.local に NEXT_WRITING_BATCH_KEY を書き Next を再起動するか、"
            "バッチを実行するターミナルで export してから同じシェルで python を実行してください。"
        )
    if "json_parse_failed" in e:
        return "AIの返答をJSONとして解釈できませんでした。しばらく待って再実行してください。"
    if e.startswith("missing_keys:"):
        return "AIの返答に必須フィールドが欠けています。再実行してください。"
    if "invalid_value:" in e:
        return "AIの返答に空のフィールドがあります。再実行してください。"
    if "final_essay_too_short" in e:
        return "完成版英文が短すぎるため却下されました。プロンプト/入力を確認してください。"
    if "empty_read_aloud" in e:
        return "完成版英文が得られませんでした。入力や API の状態を確認し、再実行してください。"
    if "No API_KEY or ADC found" in e or "API_KEY or ADC" in e:
        return (
            "Claude の API キーが、この Python プロセスの環境変数にありません。"
            "【ターミナルで batch/run_day3_proofread.py を叩く場合】その同じシェルで先に "
            "export NEXT_WRITING_BATCH_KEY='…' してから実行してください。"
            "【ブラウザの提出一覧から「添削」ボタン】キーは Next.js を起動したプロセスに渡る必要があります。"
            "別ターミナルで export しただけでは反映されません。next-writing-batch/.env.local に "
            "NEXT_WRITING_BATCH_KEY=… と書き、npm run dev（または next start）を一度止めて再起動してください。"
        )
    if "ai_proofread_failed" in e:
        tail = e.split("ai_proofread_failed:", 1)[-1].strip()
        base = "Claude 呼び出しが規定回数内に成功しませんでした。ネットワーク・API制限・CLAUDE_MODEL を確認し、失敗分のみ再実行してください。"
        if tail and tail != e and len(tail) <= 280:
            return f"{base}（詳細: {tail}）"
        return base
    if e.startswith("empty_generation:"):
        return (
            "Claudeから本文が返りませんでした（ブロック・空応答の可能性）。入力内容を短く分けて再試行するか、"
            "しばらく待ってから再実行してください。"
        )
    if "task_master_missing:" in e:
        return (
            "課題マスタ JSON が見つかりません。data/task-problems/<taskId>.json を配置するか、"
            "提出の problemId を空にして従来の question のみで実行してください。"
        )
    if "problem_not_in_master:" in e:
        return "マスタに存在しない problemId です。data/task-problems の problems 定義を確認してください。"
    return "添削処理でエラーが発生しました。ログの詳細を確認し、失敗分のみ再実行してください。"


def _pick_indices(
    submissions: List[Dict[str, Any]],
    *,
    task_id: str,
    id_filter: Optional[Set[str]],
    retry_failed: bool,
) -> List[int]:
    out: List[int] = []
    for idx, s in enumerate(submissions):
        sid = str(s.get("submissionId") or "")
        if id_filter is not None:
            if sid not in id_filter:
                continue
        elif task_id and (s.get("taskId") or "") != task_id:
            continue
        st = s.get("status")
        if id_filter is not None:
            # 運用画面から特定の submissionId だけ実行するときは、タイムアウト等で
            # processing のまま取り残した行や、設定変更後の再添削（done）も対象にする。
            if st in ("pending", "processing", "failed", "done"):
                out.append(idx)
            continue
        if retry_failed:
            if st == "failed":
                out.append(idx)
        else:
            if st == "pending":
                out.append(idx)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Day3: Gemini proofreading batch")
    parser.add_argument("--task-id", default="", help="Only process submissions matching this task_id")
    parser.add_argument("--limit", type=int, default=0, help="Process at most N records (0 = no limit)")
    parser.add_argument("--max-retries", type=int, default=3, help="Gemini retry count per record")
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Parallel workers (I/O bound). Suggested 4-8 for 100件試験。",
    )
    parser.add_argument(
        "--retry-failed",
        action="store_true",
        help="status=failed のレコードだけを再実行（部分失敗の取りこぼし防止）",
    )
    parser.add_argument(
        "--submission-ids",
        default="",
        help="カンマ区切りの submissionId だけに絞る（task-id と併用可）",
    )
    args = parser.parse_args()

    id_filter: Optional[Set[str]] = None
    if (args.submission_ids or "").strip():
        id_filter = {x.strip() for x in args.submission_ids.split(",") if x.strip()}

    store_lock = threading.Lock()
    submissions = _load_submissions_unlocked()
    pending = _pick_indices(
        submissions,
        task_id=str(args.task_id or ""),
        id_filter=id_filter,
        retry_failed=bool(args.retry_failed),
    )

    if args.limit and args.limit > 0:
        pending = pending[: args.limit]

    total = len(pending)
    print(f"[day3] targets={total} workers={args.workers} retry_failed={args.retry_failed}")
    if total == 0:
        if id_filter is not None:
            print(
                "[day3] hint: --submission-ids で指定した受付IDが data/submissions.json に無いか、"
                "該当行の status が pending|processing|failed|done 以外です。"
            )
        else:
            print(
                "[day3] hint: 対象がありません。taskId が提出と一致しているか、"
                "pending（または --retry-failed 時は failed）の行があるか確認してください。"
            )
        return

    processed = 0
    failed = 0
    t0 = time.perf_counter()

    def run_one(idx: int) -> Tuple[str, int, str]:
        nonlocal processed, failed
        with store_lock:
            data = _load_submissions_unlocked()
            s = data[idx]
            task_id = str(s.get("taskId") or "")
            student_id = str(s.get("studentId") or "")
            student_name = str(s.get("studentName") or "")
            essay_text = str(s.get("essayText") or "")
            multipart = bool(s.get("essayMultipart"))
            submission_id = str(s.get("submissionId") or "")

            s["status"] = "processing"
            # 再添削後は Viewed 記録をリセット（新しい結果を見るまで緑にしない）
            s.pop("studentResultFirstViewedAt", None)
            s["proofread"] = s.get("proofread") or {}
            s["proofread"]["startedAt"] = _now_iso()
            s["proofread"].pop("error", None)
            data[idx] = s
            _save_submissions_unlocked(data)

        try:
            question = resolve_proofreading_question(_project_root(), s)
            out = proofread_one(
                task_id=task_id,
                student_id=student_id,
                student_name=student_name,
                original_essay=essay_text,
                question=question,
                multipart=multipart,
                max_retries=args.max_retries,
            )
            with store_lock:
                data = _load_submissions_unlocked()
                s = data[idx]
                s["status"] = "done"
                s["proofread"] = {
                    "sourceTaskId": task_id,
                    "evaluation": out.evaluation,
                    "general_comment": out.general_comment,
                    "explanation": out.explanation,
                    "content_comment": out.content_comment,
                    "grammar_comment": out.grammar_comment,
                    "content_deduction": out.content_deduction,
                    "grammar_deduction": out.grammar_deduction,
                    "final_version": out.final_version,
                    "final_essay": out.final_essay,
                    "model_name": out.model_name,
                    "generated_at": out.generated_at,
                    "finishedAt": _now_iso(),
                    "submissionId": submission_id,
                }
                data[idx] = s
                _save_submissions_unlocked(data)
            return ("ok", idx, student_id)
        except Exception as e:
            raw = str(e)
            friendly = _friendly_proofread_error(raw)
            with store_lock:
                data = _load_submissions_unlocked()
                s = data[idx]
                s["status"] = "failed"
                s["proofread"] = {
                    "error": raw,
                    "operator_message": friendly,
                    "finishedAt": _now_iso(),
                    "submissionId": submission_id,
                }
                data[idx] = s
                _save_submissions_unlocked(data)
            return ("fail", idx, f"{student_id}: {friendly}")

    workers = max(1, int(args.workers))
    done_n = 0
    if workers == 1:
        for idx in pending:
            tag, _, detail = run_one(idx)
            done_n += 1
            if tag == "ok":
                processed += 1
            else:
                failed += 1
            elapsed = time.perf_counter() - t0
            remain = total - done_n
            print(
                f"[day3] {done_n}/{total} done={processed} failed={failed} remain={remain} "
                f"elapsed_s={elapsed:.1f} last={detail}"
            )
    else:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(run_one, idx): idx for idx in pending}
            for fut in as_completed(futs):
                tag, _, detail = fut.result()
                done_n += 1
                if tag == "ok":
                    processed += 1
                else:
                    failed += 1
                elapsed = time.perf_counter() - t0
                remain = total - done_n
                print(
                    f"[day3] {done_n}/{total} done={processed} failed={failed} remain={remain} "
                    f"elapsed_s={elapsed:.1f} last={detail}"
                )

    elapsed = time.perf_counter() - t0
    print(f"[day3] finished processed={processed} failed={failed} total_s={elapsed:.1f}")


if __name__ == "__main__":
    main()
