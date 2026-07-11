"use client";

import { type PointerEvent, useCallback, useEffect, useRef, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { WeaknessSourceRef } from "@/lib/ops/reports/parse-grammar-bullets";

type Props = {
  sources: WeaknessSourceRef[];
  title?: string;
  onClose: () => void;
};

type SubmissionLite = {
  essayText?: string;
  question?: string;
  studentName?: string;
  taskId?: string;
};

const ESSAY_PCT_MIN = 22;
const ESSAY_PCT_MAX = 72;
const ESSAY_PCT_DEFAULT = 40;

export function OpsReportSourceViewer({ sources, title, onClose }: Props) {
  const [activeId, setActiveId] = useState(sources[0]?.submissionId ?? "");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [essayText, setEssayText] = useState("");
  const [question, setQuestion] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingEssay, setLoadingEssay] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [essayError, setEssayError] = useState("");
  const [essayPct, setEssayPct] = useState(ESSAY_PCT_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const active = sources.find((s) => s.submissionId === activeId) ?? sources[0] ?? null;

  const authHeaders = useCallback(async () => {
    const user = getFirebaseAuth()?.currentUser;
    if (!user) throw new Error("ログイン情報を取得できませんでした。");
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const loadEssay = useCallback(
    async (submissionId: string) => {
      setEssayError("");
      setEssayText("");
      setQuestion("");
      setLoadingEssay(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/ops/submissions/${encodeURIComponent(submissionId)}`, { headers });
        const j = (await res.json()) as { ok?: boolean; message?: string; submission?: SubmissionLite };
        if (!res.ok || !j?.ok || !j.submission) {
          setEssayError(j?.message ?? "生徒の答案を取得できませんでした。");
          return;
        }
        setEssayText(String(j.submission.essayText ?? "").trim());
        setQuestion(String(j.submission.question ?? "").trim());
      } catch {
        setEssayError("通信エラーで答案を取得できませんでした。");
      } finally {
        setLoadingEssay(false);
      }
    },
    [authHeaders],
  );

  const loadPdf = useCallback(
    async (submissionId: string, pdfAvailable: boolean) => {
      setPdfError("");
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      if (!pdfAvailable) {
        setPdfError("この提出には公開済み PDF がありません。");
        return;
      }
      setLoadingPdf(true);
      try {
        const headers = await authHeaders();
        const res = await fetch(`/api/ops/reports/submissions/${encodeURIComponent(submissionId)}/pdf`, {
          headers,
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { message?: string } | null;
          setPdfError(j?.message ?? "PDF を開けませんでした。");
          return;
        }
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
      } catch {
        setPdfError("通信エラーで PDF を取得できませんでした。");
      } finally {
        setLoadingPdf(false);
      }
    },
    [authHeaders],
  );

  useEffect(() => {
    if (!active) return;
    void loadEssay(active.submissionId);
    void loadPdf(active.submissionId, active.pdfAvailable);
  }, [active, loadEssay, loadPdf]);

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

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setEssayPct(Math.min(ESSAY_PCT_MAX, Math.max(ESSAY_PCT_MIN, pct)));
  }, []);

  const onSplitterPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSplitFromClientX(e.clientX);
  };

  const onSplitterPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateSplitFromClientX(e.clientX);
  };

  const onSplitterPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const nudgeSplit = (delta: number) => {
    setEssayPct((prev) => Math.min(ESSAY_PCT_MAX, Math.max(ESSAY_PCT_MIN, prev + delta)));
  };

  if (!active) return null;

  return (
    <div className="ops-report-source-overlay" role="dialog" aria-modal="true" aria-label="元データの閲覧">
      <div className="ops-report-source-panel">
        <header className="ops-report-source-header">
          <div className="ops-report-source-header-text">
            <p className="ops-report-source-kicker">元データ</p>
            <h2 className="ops-report-source-title">{title || "答案と添削結果"}</h2>
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

        <div
          ref={splitRef}
          className={`ops-report-source-split${dragging ? " is-dragging" : ""}`}
          style={{ ["--essay-pct" as string]: `${essayPct}%` }}
        >
          <section className="ops-report-source-essay" aria-label="生徒の答案">
            <h3 className="ops-report-source-section-title">あなたの解答</h3>
            {question ? <p className="ops-report-source-question muted">{question}</p> : null}
            {loadingEssay ? <p className="muted">答案を読み込み中…</p> : null}
            {essayError ? (
              <p className="ops-report-source-inline-error" role="alert">
                {essayError}
              </p>
            ) : null}
            {!loadingEssay && !essayError ? (
              essayText ? (
                <>
                  <div className="ops-report-source-essay-spacer" aria-hidden />
                  <pre className="ops-report-source-essay-text">{essayText}</pre>
                </>
              ) : (
                <p className="muted">答案テキストがありません。</p>
              )
            ) : null}
          </section>

          <div
            className="ops-report-source-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label="左右の幅を調整"
            aria-valuemin={ESSAY_PCT_MIN}
            aria-valuemax={ESSAY_PCT_MAX}
            aria-valuenow={Math.round(essayPct)}
            tabIndex={0}
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={onSplitterPointerUp}
            onPointerCancel={onSplitterPointerUp}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                nudgeSplit(-3);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                nudgeSplit(3);
              } else if (e.key === "Home") {
                e.preventDefault();
                setEssayPct(ESSAY_PCT_MIN);
              } else if (e.key === "End") {
                e.preventDefault();
                setEssayPct(ESSAY_PCT_MAX);
              }
            }}
          >
            <span className="ops-report-source-splitter-grip" aria-hidden />
          </div>

          <section className="ops-report-source-pdf" aria-label="添削結果 PDF">
            <h3 className="ops-report-source-section-title">添削結果 PDF</h3>
            <div className="ops-report-source-body">
              {loadingPdf ? <p className="muted ops-report-source-status">PDF を読み込み中…</p> : null}
              {pdfError ? (
                <div className="ops-report-source-fallback" role="alert">
                  <p>{pdfError}</p>
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
              {pdfUrl && !loadingPdf ? (
                <iframe title="添削結果 PDF" src={pdfUrl} className="ops-report-source-iframe" />
              ) : null}
            </div>
          </section>
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
