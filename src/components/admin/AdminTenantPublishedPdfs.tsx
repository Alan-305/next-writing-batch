"use client";

import { useCallback, useEffect, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { formatDateTimeIso } from "@/lib/format-date";
import { getFirebaseAuth } from "@/lib/firebase/client";

type PublishedPdfRow = {
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
  pdfAvailableCount?: number;
  rows?: PublishedPdfRow[];
  message?: string;
};

type Props = {
  organizationId: string;
};

export function AdminTenantPublishedPdfs({ organizationId }: Props) {
  const { user } = useFirebaseAuthContext();
  const [rows, setRows] = useState<PublishedPdfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const u = getFirebaseAuth()?.currentUser;
    if (!u) throw new Error("ログイン情報を取得できませんでした。");
    const token = await u.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    setOpenError(null);
    try {
      const ah = await authHeaders();
      const res = await fetch("/api/admin/tenant-published-pdfs", { headers: ah, credentials: "same-origin" });
      const j = (await res.json()) as ListPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "公開済み PDF 一覧の取得に失敗しました。");
        setRows([]);
        return;
      }
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch {
      setError("通信エラーで公開済み PDF 一覧を取得できませんでした。");
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

  const openPdf = async (submissionId: string) => {
    setOpeningId(submissionId);
    setOpenError(null);
    try {
      const ah = await authHeaders();
      const res = await fetch(`/api/admin/tenant-published-pdfs/${encodeURIComponent(submissionId)}/pdf`, {
        headers: ah,
        credentials: "same-origin",
      });
      if (!res.ok) {
        let message = `PDF を開けませんでした（HTTP ${res.status}）。`;
        try {
          const j = (await res.json()) as { message?: string };
          if (j?.message) message = j.message;
        } catch {
          // JSON 以外は既定メッセージ
        }
        setOpenError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        setOpenError("ポップアップがブロックされました。ブラウザの設定を確認してください。");
        URL.revokeObjectURL(url);
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch {
      setOpenError("PDF の取得中に通信エラーが発生しました。");
    } finally {
      setOpeningId(null);
    }
  };

  const pdfRows = rows.filter((r) => r.pdfAvailable);

  return (
    <section className="admin-section card" aria-labelledby="admin-published-pdfs-heading">
      <div className="admin-section__head">
        <h2 id="admin-published-pdfs-heading" className="admin-section__title">
          公開済み PDF
          <span className="admin-section__count">{pdfRows.length} 件</span>
        </h2>
      </div>
      <p className="muted admin-published-pdfs__lead">
        選択中テナントで<strong>確定して生徒に公開済み</strong>の添削 PDF です（<strong>閲覧のみ</strong>）。
        表示してもテナント側の「閲覧済み」表示や提出データは<strong>変更されません</strong>。
      </p>

      {loading ? (
        <p className="admin-loading" aria-live="polite">
          公開済み PDF を読み込み中…
        </p>
      ) : error ? (
        <p className="admin-alert admin-alert--error" role="alert">
          {error}
        </p>
      ) : pdfRows.length === 0 ? (
        <p className="admin-empty">このテナントに、生徒へ公開済みで閲覧可能な PDF はまだありません。</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">課題ID</th>
                <th scope="col">学籍</th>
                <th scope="col">氏名</th>
                <th scope="col">公開日時</th>
                <th scope="col">合計点</th>
                <th scope="col">PDF</th>
              </tr>
            </thead>
            <tbody>
              {pdfRows.map((r) => (
                <tr key={r.submissionId}>
                  <td>
                    <code>{r.taskId}</code>
                  </td>
                  <td>{r.studentId}</td>
                  <td className="admin-table__name">{r.studentName}</td>
                  <td className="admin-table__date">{formatDateTimeIso(r.publishedAt)}</td>
                  <td className="admin-table__tickets">
                    {typeof r.scoreTotal === "number" ? (
                      <strong>{r.scoreTotal}</strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ops-btn ops-btn--ghost ops-btn--compact"
                      disabled={openingId === r.submissionId}
                      onClick={() => void openPdf(r.submissionId)}
                    >
                      {openingId === r.submissionId ? "開いています…" : "表示"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openError ? (
        <p className="admin-alert admin-alert--error" role="alert" style={{ marginTop: 12 }}>
          {openError}
        </p>
      ) : null}

      {!loading && rows.length > pdfRows.length ? (
        <p className="muted admin-published-pdfs__note" role="note">
          公開済みだが PDF ファイルが無い提出が {rows.length - pdfRows.length} 件あります（Day4 未生成・エラー等）。
        </p>
      ) : null}
    </section>
  );
}
