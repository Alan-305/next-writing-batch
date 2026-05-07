import argparse
import json
from pathlib import Path
from typing import Any


def _submissions_path(project_root: Path, organization_id: str) -> Path:
    return project_root / "data" / "orgs" / organization_id / "submissions.json"


def _load_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else []


def _save_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _match_row(
    row: dict[str, Any],
    *,
    student_id: str,
    submitted_by_uid: str,
    task_id: str,
    submission_ids: set[str],
) -> bool:
    if submission_ids:
        sid = str(row.get("submissionId") or "").strip()
        return sid in submission_ids
    if student_id and str(row.get("studentId") or "").strip() == student_id:
        if task_id and str(row.get("taskId") or "").strip() != task_id:
            return False
        return True
    if submitted_by_uid and str(row.get("submittedByUid") or "").strip() == submitted_by_uid:
        if task_id and str(row.get("taskId") or "").strip() != task_id:
            return False
        return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Move submissions between organizations (dry-run by default)."
    )
    parser.add_argument("--from-org", default="default", help="source organizationId")
    parser.add_argument("--to-org", required=True, help="destination organizationId")
    parser.add_argument("--student-id", default="", help="filter by studentId")
    parser.add_argument("--submitted-by-uid", default="", help="filter by submittedByUid")
    parser.add_argument("--task-id", default="", help="optional filter by taskId")
    parser.add_argument(
        "--submission-ids",
        default="",
        help="comma-separated submissionId list (takes precedence over student/uid filters)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="actually write changes (without this, only preview)",
    )
    args = parser.parse_args()

    from_org = args.from_org.strip()
    to_org = args.to_org.strip()
    if not from_org or not to_org:
        raise SystemExit("--from-org / --to-org must be non-empty")
    if from_org == to_org:
        raise SystemExit("--from-org and --to-org must differ")

    submission_ids = {
        x.strip() for x in str(args.submission_ids or "").split(",") if x.strip()
    }
    student_id = str(args.student_id or "").strip()
    submitted_by_uid = str(args.submitted_by_uid or "").strip()
    task_id = str(args.task_id or "").strip()
    if not submission_ids and not student_id and not submitted_by_uid:
        raise SystemExit(
            "Specify at least one filter: --submission-ids or --student-id or --submitted-by-uid"
        )

    project_root = Path(__file__).resolve().parents[1]
    src_path = _submissions_path(project_root, from_org)
    dst_path = _submissions_path(project_root, to_org)

    src_rows = _load_rows(src_path)
    dst_rows = _load_rows(dst_path)
    dst_ids = {str(r.get("submissionId") or "").strip() for r in dst_rows}

    keep_src: list[dict[str, Any]] = []
    move_rows: list[dict[str, Any]] = []
    skipped_duplicate = 0

    for row in src_rows:
        if not _match_row(
            row,
            student_id=student_id,
            submitted_by_uid=submitted_by_uid,
            task_id=task_id,
            submission_ids=submission_ids,
        ):
            keep_src.append(row)
            continue

        sid = str(row.get("submissionId") or "").strip()
        if sid and sid in dst_ids:
            skipped_duplicate += 1
            keep_src.append(row)
            continue

        moved = dict(row)
        moved["organizationId"] = to_org
        move_rows.append(moved)
        if sid:
            dst_ids.add(sid)

    print(
        f"[move-submissions] from={from_org} to={to_org} source_total={len(src_rows)} "
        f"target_total={len(dst_rows)} matched={len(move_rows)} skipped_duplicate={skipped_duplicate}"
    )
    if move_rows:
        sample = [str(r.get("submissionId") or "") for r in move_rows[:10]]
        print("[move-submissions] moving submissionIds:", ",".join(sample))

    if not args.apply:
        print("[move-submissions] dry-run only. add --apply to commit file changes.")
        return

    _save_rows(src_path, keep_src)
    _save_rows(dst_path, dst_rows + move_rows)
    print(
        f"[move-submissions] applied. source_now={len(keep_src)} target_now={len(dst_rows) + len(move_rows)}"
    )


if __name__ == "__main__":
    main()
