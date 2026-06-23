"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { formatDateTimeIso } from "@/lib/format-date";
import { getFirebaseAuth } from "@/lib/firebase/client";

type PublishedRow = {
  submissionId: string;
  taskId: string;
  studentId: string;
  studentName: string;
  publishedAt: string;
  scoreTotal: number | null;
  pdfAvailable: boolean;
};

type ListPayload = {
  ok?: boolean;
  organizationId?: string;
  total?: number;
  rows?: PublishedRow[];
  message?: string;
};

type SortKey = "publishedDesc" | "publishedAsc" | "studentName" | "taskId" | "scoreDesc" | "scoreAsc";

const PAGE_SIZE = 50;

type Props = {
  organizationId: string;
};

function studentResultHref(submissionId: string): string {
  return `/result/${encodeURIComponent(submissionId)}`;
}

function sortRows(rows: PublishedRow[], sortKey: SortKey): PublishedRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sortKey) {
      case "publishedAsc":
        return a.publishedAt.localeCompare(b.publishedAt);
      case "studentName":
        return a.studentName.localeCompare(b.studentName, "ja");
      case "taskId":
        return a.taskId.localeCompare(b.taskId);
      case "scoreDesc":
        return (b.scoreTotal ?? -1) - (a.scoreTotal ?? -1);
      case "scoreAsc":
        return (a.scoreTotal ?? 9999) - (b.scoreTotal ?? 9999);
      case "publishedDesc":
      default:
        return b.publishedAt.localeCompare(a.publishedAt);
    }
  });
  return copy;
}

export function AdminTenantPublishedPdfs({ organizationId }: Props) {
  const { user } = useFirebaseAuthContext();
  const [rows, setRows] = useState<PublishedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("publishedDesc");
  const [page, setPage] = useState(1);

  const authHeaders = useCallback(async () => {
    const u = getFirebaseAuth()?.currentUser;
    if (!u) throw new Error("ログイン情報を取得できませんでした。");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ah = await authHeaders();
      const res = await fetch("/api/admin/tenant-published-pdfs", { headers: ah, credentials: "same-origin" });
      const j = (await res.json()) as ListPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "公開済み一覧の取得に失敗しました。");
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setError("通信エラーで公開済み一覧を取得できませんでした。");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!user || !organizationId) return;
    void loadRows();
  }, [user, organizationId, loadRows]);

  useEffect(() => {
    const onChange = () => void loadRows();
    window.addEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [query, sortKey, organizationId]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) => {
        const hay = `${r.taskId} ${r.studentId} ${r.studentName} ${r.submissionId}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return sortRows(list, sortKey);
  }, [rows, query, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="admin-section card" aria-labelledby="admin-published-results-heading">
      <div className="admin-section__head">
        <h2 id="admin-published-results-heading" className="admin-section__title">
          公開済み（生徒画面）
          <span className="admin-section__count">{rows.length} 件</span>
        </h2>
      </div>
      <p className="muted admin-published-pdfs__lead">
        選択中テナントで<strong>生徒に公開済み</strong>の添削結果です。リンクから<strong>生徒と同じ画面</strong>
        を別タブで開けます（<strong>閲覧のみ</strong>）。管理者の閲覧では「閲覧済み」は記録されません。
      </p>

      {!loading && rows.length > 0 ? (
        <div className="admin-published-pdfs__controls">
          <label className="field admin-published-pdfs__search">
            <span className="sr-only">検索</span>
            <input
              type="search"
              value={query}
              placeholder="課題ID・学籍・氏名で検索"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
          </label>
          <label className="field admin-published-pdfs__sort">
            <span>並べ替え</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="publishedDesc">公開日（新しい順）</option>
              <option value="publishedAsc">公開日（古い順）</option>
              <option value="studentName">氏名（あいうえお順）</option>
              <option value="taskId">課題ID</option>
              <option value="scoreDesc">合計点（高い順）</option>
              <option value="scoreAsc">合計点（低い順）</option>
            </select>
          </label>
        </div>
      ) : null}

      {loading ? (
        <p className="admin-loading" aria-live="polite">
          公開済み一覧を読み込み中…
        </p>
      ) : error ? (
        <p className="admin-alert admin-alert--error" role="alert">
          {error}
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="admin-empty">
          {rows.length === 0
            ? "このテナントに、生徒へ公開済みの添削結果はまだありません。"
            : "条件に一致する公開済み結果はありません。"}
        </p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">課題ID</th>
                  <th scope="col">学籍</th>
                  <th scope="col">氏名</th>
                  <th scope="col">公開日時</th>
                  <th scope="col">合計点</th>
                  <th scope="col">生徒画面</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.submissionId}>
                    <td>
                      <code>{r.taskId}</code>
                    </td>
                    <td>{r.studentId}</td>
                    <td className="admin-table__name">{r.studentName}</td>
                    <td className="admin-table__date">{formatDateTimeIso(r.publishedAt)}</td>
                    <td className="admin-table__tickets">
                      {typeof r.scoreTotal === "number" ? <strong>{r.scoreTotal}</strong> : "—"}
                    </td>
                    <td>
                      <a
                        href={studentResultHref(r.submissionId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ops-btn ops-btn--ghost ops-btn--compact admin-published-result-link"
                      >
                        表示
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="admin-published-pdfs__pager" role="navigation" aria-label="ページ送り">
              <button
                type="button"
                className="ops-btn ops-btn--ghost ops-btn--compact"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                前へ
              </button>
              <span className="muted admin-published-pdfs__pager-label">
                {page} / {totalPages} ページ（{filteredRows.length} 件）
              </span>
              <button
                type="button"
                className="ops-btn ops-btn--ghost ops-btn--compact"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                次へ
              </button>
            </div>
          ) : (
            <p className="muted admin-published-pdfs__note">{filteredRows.length} 件を表示中</p>
          )}
        </>
      )}
    </section>
  );
}
