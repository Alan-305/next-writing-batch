"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { DeleteSubmissionButton } from "@/components/DeleteSubmissionButton";
import { OpsSubmissionStatusBadge } from "@/components/ops/OpsSubmissionStatusBadge";
import {
  CancelProofreadButton,
  ProofreadSubmissionButton,
  RedoProofreadSubmissionButton,
} from "@/components/ProofreadSubmissionButton";
import { OPS_COPY, STATUS_FILTER_OPTIONS } from "@/lib/ops/submission-status-labels";
import { formatDateTimeIso } from "@/lib/format-date";

export type SubmissionListRow = {
  submissionId: string;
  submittedAt: string;
  taskId: string;
  studentId: string;
  studentName: string;
  /** 表示用（viewed 含む） */
  status: string;
  /** 操作ボタン用の生 status */
  rawStatus?: string;
  proofreadQueuedAt?: string;
  studentViewed?: boolean;
  hasDay4Assets?: boolean;
  resultPublished?: boolean;
  studentResultFirstViewedAt?: string;
};

type SortKey =
  | "submitted_desc"
  | "submitted_asc"
  | "task_id"
  | "student_name"
  | "status_alpha"
  | "status_pending_first";

function submissionListRank(item: SubmissionListRow): number {
  const st = item.rawStatus ?? item.status;
  if (st === "pending") return 0;
  if (st === "queued") return 1;
  if (st === "processing") return 2;
  if (st === "failed") return 3;
  if (item.studentViewed || item.status === "viewed") return 5;
  if (st === "done") return 4;
  return 99;
}

function submissionStatusSortLabel(item: SubmissionListRow): string {
  if (item.studentViewed || item.status === "viewed") return "viewed";
  const st = item.rawStatus ?? item.status;
  return st;
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
  enableZipSelection?: boolean;
  onReloadSubmissions?: () => void;
};

const PAGE_OPTIONS = [25, 50, 100, 200] as const;

export function OpsSubmissionsTable({ rows, enableZipSelection = false, onReloadSubmissions }: Props) {
  const router = useRouter();
  const { user } = useFirebaseAuthContext();
  const total = rows.length;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("status_pending_first");
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
      const raw = r.rawStatus ?? r.status;
      if (statusFilter === "done" && r.studentViewed) return false;
      if (statusFilter && raw !== statusFilter) return false;
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

  const onFilterChange = () => setPage(1);

  useEffect(() => {
    if (enableZipSelection) {
      setZipSelected(new Set());
      setZipMsg("");
    }
  }, [enableZipSelection, statusFilter, query]);

  useEffect(() => {
    setRunningTaskId(null);
    const onStart = (ev: Event) => {
      const d = (ev as CustomEvent<{ taskId?: string }>).detail;
      setRunningTaskId((d?.taskId || "").trim() || null);
    };
    const onEnd = () => setRunningTaskId(null);
    window.addEventListener("proofread:run-start", onStart as EventListener);
    window.addEventListener("proofread:run-end", onEnd as EventListener);
    return () => {
      window.removeEventListener("proofread:run-start", onStart as EventListener);
      window.removeEventListener("proofread:run-end", onEnd as EventListener);
    };
  }, []);

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
    if (!window.confirm(`${ids.length} 件の提出を 1 つの ZIP にまとめます。よろしいですか？`)) {
      return;
    }
    setZipBusy(true);
    setZipMsg("");
    try {
      if (!user) {
        setZipMsg("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/package-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    onReloadSubmissions?.();
    window.setTimeout(() => setListRefreshing(false), 900);
  };

  return (
    <div>
      <div className="ops-toolbar">
        <button
          type="button"
          className="ops-btn ops-btn--ghost"
          disabled={listRefreshing}
          onClick={() => onRefreshList()}
        >
          {listRefreshing ? OPS_COPY.refreshing : OPS_COPY.refresh}
        </button>

        <label className="field">
          <span>検索</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onFilterChange();
            }}
            placeholder={OPS_COPY.searchPlaceholder}
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>状態</span>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              onFilterChange();
            }}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>並べ替え</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setPage(1);
            }}
          >
            <option value="status_pending_first">要対応を上に</option>
            <option value="submitted_desc">提出日（新しい順）</option>
            <option value="submitted_asc">提出日（古い順）</option>
            <option value="task_id">課題ID</option>
            <option value="student_name">氏名</option>
            <option value="status_alpha">状態（あいうえお）</option>
          </select>
        </label>

        <label className="field">
          <span>表示件数</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(1);
            }}
          >
            {PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 件
              </option>
            ))}
            <option value={0}>すべて</option>
          </select>
        </label>
      </div>

      {enableZipSelection ? (
        <p className="muted" style={{ marginBottom: 10, fontSize: "0.92rem" }}>
          左端のチェックで ZIP に入れる提出を選び、表の下で「選択分の PDF を ZIP 化」を押してください（ZIP 内は PDF のみ。PDF 内の QR コードは含みます。音声 mp3 は含みません）。
        </p>
      ) : null}

      <p className="ops-table-meta">
        全 <strong>{total}</strong> 件
        {filtered.length !== total ? (
          <>
            {" "}
            / 表示対象 <strong>{filtered.length}</strong> 件
          </>
        ) : null}
        {pageSize > 0 && sorted.length > 0 ? (
          <>
            {" "}
            / {sliceStart + 1}–{Math.min(sliceStart + pageSize, sorted.length)} 件目
          </>
        ) : null}
      </p>

      {pageSize > 0 && pageCount > 1 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <button type="button" className="ops-btn ops-btn--ghost" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            前へ
          </button>
          <span style={{ fontSize: "0.9rem" }}>
            {safePage} / {pageCount} ページ
          </span>
          <button
            type="button"
            className="ops-btn ops-btn--ghost"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            次へ
          </button>
        </div>
      ) : null}

      <div className="ops-table-wrap">
        <table>
          <thead>
            <tr>
              {enableZipSelection ? (
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    title="このページの Day4 済みをすべて選択"
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
              <th>詳細</th>
              <th>提出日時</th>
              <th>課題ID</th>
              <th>学籍</th>
              <th>氏名</th>
              <th>状態</th>
              <th className="ops-table-actions-col">操作</th>
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
              pageRows.map((item) => {
                const rawStatus = item.rawStatus ?? item.status;
                const tid = (runningTaskId ?? "").trim();
                const forceProcessing =
                  rawStatus === "pending" && tid !== "" && item.taskId === tid;

                return (
                  <tr key={item.submissionId}>
                    {enableZipSelection ? (
                      <td>
                        <input
                          type="checkbox"
                          disabled={zipBusy || !item.hasDay4Assets}
                          title={item.hasDay4Assets ? "ZIP に含める" : "添削確定・PDF 化できる状態ではありません"}
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
                          className="ops-btn ops-btn--ghost ops-btn--compact"
                          prefetch={false}
                        >
                          {OPS_COPY.detailLink}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{formatDateTimeIso(item.submittedAt)}</td>
                    <td>
                      <code style={{ fontSize: "0.85rem" }}>{item.taskId}</code>
                    </td>
                    <td>{item.studentId}</td>
                    <td>{item.studentName}</td>
                    <td>
                      <OpsSubmissionStatusBadge
                        status={rawStatus}
                        studentViewed={item.studentViewed}
                        viewedAt={item.studentResultFirstViewedAt}
                        forceProcessing={forceProcessing}
                      />
                    </td>
                    <td className="ops-table-actions-col">
                      <div className="ops-row-actions">
                        <ProofreadSubmissionButton
                          submissionId={item.submissionId}
                          taskId={item.taskId}
                          studentLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                          status={rawStatus}
                          proofreadQueuedAt={item.proofreadQueuedAt}
                          onEnqueued={onReloadSubmissions}
                        />
                        <CancelProofreadButton
                          submissionId={item.submissionId}
                          taskId={item.taskId}
                          studentLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                          status={rawStatus}
                          proofreadQueuedAt={item.proofreadQueuedAt}
                          onCancelled={onReloadSubmissions}
                        />
                        {rawStatus === "done" || rawStatus === "failed" || rawStatus === "queued" ? (
                          <RedoProofreadSubmissionButton
                            submissionId={item.submissionId}
                            taskId={item.taskId}
                            studentLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                            status={rawStatus}
                            proofreadQueuedAt={item.proofreadQueuedAt}
                            onEnqueued={onReloadSubmissions}
                          />
                        ) : null}
                        <DeleteSubmissionButton
                          submissionId={item.submissionId}
                          confirmLabel={`${item.studentName}（${item.studentId}） / ${item.taskId}`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {enableZipSelection ? (
        <div className="ops-zip-bar">
          <span style={{ fontSize: "0.92rem" }}>
            ZIP 選択: <strong>{zipSelected.size}</strong> 件
          </span>
          <button type="button" className="ops-btn ops-btn--ghost" disabled={zipBusy} onClick={() => selectAllFilteredWithDay4()}>
            表示中の Day4 済みをすべて選択
          </button>
          <button type="button" className="ops-btn ops-btn--ghost" disabled={zipBusy || zipSelected.size === 0} onClick={() => clearZipSelection()}>
            選択解除
          </button>
          <button type="button" className="ops-btn ops-btn--primary" disabled={zipBusy || zipSelected.size === 0} onClick={() => void runZipSelection()}>
            {zipBusy ? "ZIP 作成中…" : "選択分の PDF を ZIP 化"}
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
