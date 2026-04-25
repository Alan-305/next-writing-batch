"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DeleteSubmissionButton } from "@/components/DeleteSubmissionButton";
import {
  ProofreadSubmissionButton,
  RedoProofreadSubmissionButton,
} from "@/components/ProofreadSubmissionButton";
import { formatDateTimeIso } from "@/lib/format-date";

export type SubmissionListRow = {
  submissionId: string;
  submittedAt: string;
  taskId: string;
  studentId: string;
  studentName: string;
  status: string;
  /** Day4 成果物（ZIP 対象）が1つ以上ある */
  hasDay4Assets?: boolean;
  /** 運用が生徒向け結果を公開済み（studentRelease.operatorApprovedAt あり） */
  resultPublished?: boolean;
  /** 公開結果ページの初回閲覧日時（ISO） */
  studentResultFirstViewedAt?: string;
};

type SortKey =
  | "submitted_desc"
  | "submitted_asc"
  | "task_id"
  | "student_name"
  | "status_alpha"
  | "status_pending_first";

function hasStudentViewedPublishedResult(item: SubmissionListRow): boolean {
  return (
    item.status === "done" &&
    Boolean(item.resultPublished) &&
    Boolean(String(item.studentResultFirstViewedAt ?? "").trim())
  );
}

/** 未処理を上に並べる用（Viewed は done より後ろ） */
function submissionListRank(item: SubmissionListRow): number {
  const st = item.status;
  if (st === "pending") return 0;
  if (st === "processing") return 1;
  if (st === "failed") return 2;
  if (st === "done") {
    if (hasStudentViewedPublishedResult(item)) return 4;
    return 3;
  }
  return 99;
}

function submissionStatusSortLabel(item: SubmissionListRow): string {
  if (item.status === "pending") return "pending";
  if (item.status === "processing") return "processing";
  if (item.status === "failed") return "failed";
  if (hasStudentViewedPublishedResult(item)) return "viewed";
  if (item.status === "done") return "done";
  return item.status;
}

function compareRows(a: SubmissionListRow, b: SubmissionListRow, sort: SortKey): number {
  switch (sort) {
    case "submitted_desc":
      return b.submittedAt.localeCompare(a.submittedAt);
    case "submitted_asc":
      return a.submittedAt.localeCompare(b.submittedAt);
    case "task_id": {
      const c = a.taskId.localeCompare(b.taskId, "ja");
      if (c !== 0) return c;
      return b.submittedAt.localeCompare(a.submittedAt);
    }
    case "student_name": {
      const c = a.studentName.localeCompare(b.studentName, "ja");
      if (c !== 0) return c;
      return b.submittedAt.localeCompare(a.submittedAt);
    }
    case "status_alpha":
      return (
        submissionStatusSortLabel(a).localeCompare(submissionStatusSortLabel(b)) ||
        b.submittedAt.localeCompare(a.submittedAt)
      );
    case "status_pending_first": {
      const ra = submissionListRank(a);
      const rb = submissionListRank(b);
      if (ra !== rb) return ra - rb;
      return b.submittedAt.localeCompare(a.submittedAt);
    }
    default:
      return 0;
  }
}

type Props = {
  rows: SubmissionListRow[];
  /** 受付IDを選んで ZIP（Day4 ファイル） */
  enableZipSelection?: boolean;
};

const PAGE_OPTIONS = [25, 50, 100, 200] as const;

export function OpsSubmissionsTable({ rows, enableZipSelection = false }: Props) {
  const router = useRouter();
  const total = rows.length;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("submitted_desc");
  const [pageSize, setPageSize] = useState<number>(50);
  const [page, setPage] = useState(1);
  const [zipSelected, setZipSelected] = useState<Set<string>>(() => new Set());
  const [zipBusy, setZipBusy] = useState(false);
  const [zipMsg, setZipMsg] = useState("");
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [listRefreshing, setListRefreshing] = useState(false);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.taskId}\n${r.studentId}\n${r.studentName}\n${r.submissionId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, statusFilter, q]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => compareRows(a, b, sort));
    return copy;
  }, [filtered, sort]);

  const pageCount = pageSize <= 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const safePage = Math.min(page, pageCount);
  const sliceStart = pageSize <= 0 ? 0 : (safePage - 1) * pageSize;
  const pageRows = pageSize <= 0 ? sorted : sorted.slice(sliceStart, sliceStart + pageSize);

  const onFilterChange = () => {
    setPage(1);
  };

  useEffect(() => {
    if (enableZipSelection) {
      setZipSelected(new Set());
      setZipMsg("");
    }
  }, [enableZipSelection, statusFilter, query]);

  useEffect(() => {
    /** 再読み込み・別ページから戻る・HMR 後に「一括添削中」の表示だけが残るのを防ぐ */
    setRunningTaskId(null);
    const onStart = (ev: Event) => {
      const d = (ev as CustomEvent<{ taskId?: string }>).detail;
      const tid = (d?.taskId || "").trim();
      setRunningTaskId(tid || null);
    };
    const onEnd = () => {
      setRunningTaskId(null);
    };
    window.addEventListener("proofread:run-start", onStart as EventListener);
    window.addEventListener("proofread:run-end", onEnd as EventListener);
    return () => {
      window.removeEventListener("proofread:run-start", onStart as EventListener);
      window.removeEventListener("proofread:run-end", onEnd as EventListener);
    };
  }, []);

  const statusCell = (item: SubmissionListRow) => {
    const tid = (runningTaskId ?? "").trim();
    /** 一括「添削を実行」が走っている間だけ。ページ再読み込みで runningTaskId は消える。 */
    const runningPending = item.status === "pending" && tid !== "" && item.taskId === tid;
    if (runningPending) {
      return (
        <span className="status-running status-running--pending" title="一括添削実行中（pending）">
          <span className="status-spinner" aria-hidden="true" />
          添削中
        </span>
      );
    }
    /** DB 上の取り残し。スピナーは出さず、再実行可能であることを示す（再起動しても消えない）。 */
    if (item.status === "processing") {
      return (
        <span
          className="status-processing-stale"
          title="バッチが途中で止まるとこのまま残ることがあります。右の「添削」で再実行できます。"
        >
          processing
          <span className="status-processing-stale-hint">（再実行可）</span>
        </span>
      );
    }
    if (item.status === "pending") {
      return <span className="ops-status-pending">pending</span>;
    }
    if (item.status === "failed") {
      return <span className="ops-status-failed">failed</span>;
    }
    if (item.status === "done") {
      if (hasStudentViewedPublishedResult(item)) {
        const at = String(item.studentResultFirstViewedAt ?? "").trim();
        return (
          <span className="ops-status-viewed" title={at ? `初回閲覧: ${at}` : undefined}>
            Viewed
          </span>
        );
      }
      return <span className="ops-status-done">done</span>;
    }
    return item.status;
  };

  const toggleZipSelect = (submissionId: string) => {
    setZipSelected((prev) => {
      const next = new Set(prev);
      if (next.has(submissionId)) next.delete(submissionId);
      else next.add(submissionId);
      return next;
    });
  };

  const toggleZipPageAll = () => {
    const selectable = pageRows.filter((r) => r.hasDay4Assets).map((r) => r.submissionId);
    const allChosen = selectable.length > 0 && selectable.every((id) => zipSelected.has(id));
    setZipSelected((prev) => {
      const next = new Set(prev);
      if (allChosen) {
        for (const id of selectable) next.delete(id);
      } else {
        for (const id of selectable) next.add(id);
      }
      return next;
    });
  };

  const selectAllFilteredWithDay4 = () => {
    const ids = filtered.filter((r) => r.hasDay4Assets).map((r) => r.submissionId);
    setZipSelected(new Set(ids));
    setZipMsg(ids.length ? `ZIP 対象を ${ids.length} 件に設定しました。` : "条件に一致する Day4 済み提出がありません。");
  };

  const clearZipSelection = () => {
    setZipSelected(new Set());
    setZipMsg("");
  };

  const runZipSelection = async () => {
    const ids = [...zipSelected];
    if (ids.length === 0) {
      setZipMsg("ZIP する提出を選んでください。");
      return;
    }
    if (!window.confirm(`${ids.length} 件の提出を 1 つの ZIP にまとめます（各 Day4 の pdf/audio/qr）。よろしいですか？`)) {
      return;
    }
    setZipBusy(true);
    setZipMsg("");
    try {
      const res = await fetch("/api/ops/package-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "selection", submissionIds: ids }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; stdout?: string; stderr?: string };
      if (!res.ok || !j.ok) {
        const tail = [j.stdout, j.stderr].filter(Boolean).join("\n---\n");
        setZipMsg(`${j.message ?? "失敗しました。"}${tail ? `\n${tail}` : ""}`);
        return;
      }
      setZipMsg(j.message ?? "完了しました。");
      window.location.href = "/ops/deliverables";
    } catch {
      setZipMsg("通信エラーが発生しました。");
    } finally {
      setZipBusy(false);
    }
  };

  const colCount = enableZipSelection ? 8 : 7;

  const onRefreshList = () => {
    setListRefreshing(true);
    router.refresh();
    window.setTimeout(() => setListRefreshing(false), 900);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 14px",
          alignItems: "center",
          marginTop: 0,
          marginBottom: 14,
        }}
      >
        <button type="button" disabled={listRefreshing} onClick={() => onRefreshList()}>
          {listRefreshing ? "再読み込み中…" : "一覧を最新化（JSONの手編集を反映）"}
        </button>
      </div>

      <div
        className="field"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "10px 14px",
          alignItems: "end",
          marginBottom: 14,
        }}
      >
        <label className="field" style={{ marginBottom: 0 }}>
          <span>検索（課題ID・学籍・氏名・受付ID の一部）</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onFilterChange();
            }}
            placeholder="入力すると即座に絞り込み"
            autoComplete="off"
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>ステータス</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              onFilterChange();
            }}
          >
            <option value="">すべて</option>
            <option value="pending">pending</option>
            <option value="processing">processing</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>並べ替え</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
          >
            <option value="submitted_desc">提出日（新しい順）</option>
            <option value="submitted_asc">提出日（古い順）</option>
            <option value="status_pending_first">ステータス（未処理を上）</option>
            <option value="status_alpha">ステータス（あいうえお）</option>
            <option value="task_id">課題ID</option>
            <option value="student_name">氏名</option>
          </select>
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span>1ページ件数</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setPageSize(v);
              setPage(1);
            }}
          >
            {PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 件
              </option>
            ))}
            <option value={0}>全件（フィルタ後）</option>
          </select>
        </label>
      </div>

      <p style={{ margin: "0 0 10px", fontSize: "0.92rem" }}>
        全 <strong>{total}</strong> 件
        {filtered.length !== total ? (
          <>
            {" "}
            → 条件一致 <strong>{filtered.length}</strong> 件
          </>
        ) : null}
        {pageSize > 0 ? (
          <>
            {" "}
            · 表示 {sliceStart + 1}–{Math.min(sliceStart + pageSize, sorted.length)} 件目
          </>
        ) : (
          <> · 表示 {sorted.length} 件</>
        )}
      </p>

      {pageSize > 0 && pageCount > 1 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            前へ
          </button>
          <span style={{ fontSize: "0.9rem" }}>
            {safePage} / {pageCount} ページ
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            次へ
          </button>
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              {enableZipSelection ? (
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    title="このページの Day4 済みをすべて選択／解除"
                    aria-label="このページの Day4 済みをすべて選択"
                    disabled={zipBusy || !pageRows.some((r) => r.hasDay4Assets)}
                    checked={(() => {
                      const sel = pageRows.filter((r) => r.hasDay4Assets);
                      return sel.length > 0 && sel.every((r) => zipSelected.has(r.submissionId));
                    })()}
                    onChange={() => toggleZipPageAll()}
                  />
                </th>
              ) : null}
              <th>detail</th>
              <th>submittedAt</th>
              <th>taskId</th>
              <th>studentId</th>
              <th>studentName</th>
              <th>status</th>
              <th style={{ minWidth: "200px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={colCount}>
                  {total === 0 ? "まだ提出がありません。" : "条件に一致する提出がありません。"}
                </td>
              </tr>
            ) : (
              pageRows.map((item) => (
                <tr key={item.submissionId}>
                  {enableZipSelection ? (
                    <td>
                      <input
                        type="checkbox"
                        disabled={zipBusy || !item.hasDay4Assets}
                        title={item.hasDay4Assets ? "ZIP に含める" : "Day4 成果物なし"}
                        checked={zipSelected.has(item.submissionId)}
                        onChange={() => toggleZipSelect(item.submissionId)}
                        aria-label={`ZIP に含める ${item.submissionId}`}
                      />
                    </td>
                  ) : null}
                  <td>
                    {String(item.submissionId ?? "").trim() ? (
                      <Link
                        href={`/ops/submissions/${encodeURIComponent(item.submissionId)}`}
                        prefetch={false}
                      >
                        修正・詳細
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{formatDateTimeIso(item.submittedAt)}</td>
                  <td>{item.taskId}</td>
                  <td>{item.studentId}</td>
                  <td>{item.studentName}</td>
                  <td>{statusCell(item)}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <ProofreadSubmissionButton
                        submissionId={item.submissionId}
                        taskId={item.taskId}
                        studentLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                        status={item.status}
                      />
                      {item.status === "done" ? (
                        <RedoProofreadSubmissionButton
                          submissionId={item.submissionId}
                          taskId={item.taskId}
                          studentLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                        />
                      ) : null}
                      <DeleteSubmissionButton
                        submissionId={item.submissionId}
                        confirmLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {enableZipSelection ? (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: "0.95rem" }}>
            ZIP 対象: <strong>{zipSelected.size}</strong> 件
          </span>
          <button type="button" disabled={zipBusy} onClick={() => selectAllFilteredWithDay4()}>
            フィルタ一致の Day4 済みをすべて選択
          </button>
          <button type="button" disabled={zipBusy || zipSelected.size === 0} onClick={() => clearZipSelection()}>
            選択解除
          </button>
          <button type="button" disabled={zipBusy || zipSelected.size === 0} onClick={() => void runZipSelection()}>
            {zipBusy ? "ZIP 作成中…" : "選択した提出を ZIP 化"}
          </button>
        </div>
      ) : null}
      {enableZipSelection && zipMsg ? (
        <p className={zipMsg.includes("失敗") || zipMsg.includes("エラー") ? "error" : "muted"} style={{ marginTop: 10 }}>
          {zipMsg}
        </p>
      ) : null}
    </div>
  );
}
