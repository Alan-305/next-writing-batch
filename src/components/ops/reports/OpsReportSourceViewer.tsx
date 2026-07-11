"use client";

import { useCallback, useEffect, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { WeaknessSourceRef } from "@/lib/ops/reports/parse-grammar-bullets";

type Props = {
  sources: WeaknessSourceRef[];
  title?: string;
  onClose: () => void;
};

export function OpsReportSourceViewer({ sources, title, onClose }: Props) {
  const [activeId, setActiveId] = useState(sources[0]?.submissionId ?? "");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const active = sources.find((s) => s.submissionId === activeId) ?? sources[0] ?? null;

  const loadPdf = useCallback(async (submissionId: string, pdfAvailable: boolean) => {
    setError("");
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (!pdfAvailable) {
      setError("この提出には公開済み PDF がありません。確認＆修正画面から内容を確認できます。");
      return;
    }
    setLoading(true);
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) {
        setError("ログイン情報を取得できませんでした。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch(`/api/ops/reports/submissions/${encodeURIComponent(submissionId)}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(j?.message ?? "PDF を開けませんでした。");
        return;
      }
      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch {
      setError("通信エラーで PDF を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadPdf(active.submissionId, active.pdfAvailable);
  }, [active, loadPdf]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  if (!active) return null;

  return (
    <div className="ops-report-source-overlay" role="dialog" aria-modal="true" aria-label="元データの閲覧">
      <div className="ops-report-source-panel">
        <header className="ops-report-source-header">
          <div className="ops-report-source-header-text">
            <p className="ops-report-source-kicker">元データ</p>
            <h2 className="ops-report-source-title">{title || "添削結果 PDF"}</h2>
            <p className="ops-report-source-meta muted">
              {active.studentName} ／ 課題 {active.taskId}
            </p>
          </div>
          <button type="button" className="ops-reports-btn ops-reports-btn--ghost" onClick={onClose}>
            戻る
          </button>
        </header>

        {sources.length > 1 ? (
          <div className="ops-report-source-tabs" role="tablist" aria-label="提出の選択">
            {sources.map((s, i) => (
              <button
                key={s.submissionId}
                type="button"
                role="tab"
                aria-selected={s.submissionId === active.submissionId}
                className={`ops-report-source-tab${s.submissionId === active.submissionId ? " is-active" : ""}`}
                onClick={() => setActiveId(s.submissionId)}
              >
                {i + 1}. {s.studentName}
                <span className="muted">（{s.taskId}）</span>
                {!s.pdfAvailable ? <span className="ops-report-source-no-pdf">PDFなし</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ops-report-source-body">
          {loading ? <p className="muted ops-report-source-status">PDF を読み込み中…</p> : null}
          {error ? (
            <div className="ops-report-source-fallback" role="alert">
              <p>{error}</p>
              <a
                className="ops-reports-btn"
                href={`/ops/submissions/${encodeURIComponent(active.submissionId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                確認＆修正を開く
              </a>
            </div>
          ) : null}
          {pdfUrl && !loading ? (
            <iframe title="添削結果 PDF" src={pdfUrl} className="ops-report-source-iframe" />
          ) : null}
        </div>

        <footer className="ops-report-source-footer">
          <a
            className="ops-report-source-detail-link"
            href={`/ops/submissions/${encodeURIComponent(active.submissionId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            確認＆修正を別タブで開く
          </a>
          <button type="button" className="ops-reports-btn" onClick={onClose}>
            レポートに戻る
          </button>
        </footer>
      </div>
    </div>
  );
}
