"use client";

import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";
import type { ReportSummaryResult } from "@/lib/ops/reports/build-report-summary";
import type { ReportWeaknessesResult } from "@/lib/ops/reports/build-report-weaknesses";
import { OpsReportHistogram, OpsReportScatter, OpsReportTrend } from "@/components/ops/reports/OpsReportCharts";
import { OpsReportClassHandout, OpsReportPersonalHandout } from "@/components/ops/reports/OpsReportHandouts";
import { OpsReportCategoryFilter } from "@/components/ops/reports/OpsReportCategoryFilter";
import { OpsReportSourceViewer } from "@/components/ops/reports/OpsReportSourceViewer";
import {
  filterGrammarWeaknessesByCategories,
  type WeaknessSourceRef,
} from "@/lib/ops/reports/parse-grammar-bullets";
import type { GrammarCategoryId } from "@/lib/ops/reports/grammar-categories";

type TaskOption = { taskId: string; displayLabel: string };

type SummaryView = Omit<ReportSummaryResult, "rows" | "byTask"> & {
  byTask: Array<ReportSummaryResult["byTask"][number] & { displayLabel: string }>;
};

type SummaryPayload = {
  ok?: boolean;
  message?: string;
  filters?: {
    from?: string | null;
    to?: string | null;
    taskIds?: string[];
    studentQuery?: string | null;
    publishedOnly?: boolean;
  };
  summary?: SummaryView;
  taskOptions?: TaskOption[];
};

type WeaknessesPayload = {
  ok?: boolean;
  message?: string;
  weaknesses?: ReportWeaknessesResult;
};

type ViewMode = "overview" | "weaknesses" | "personal" | "handout-class" | "handout-personal";

function focusLabel(focus: string): string {
  switch (focus) {
    case "content":
      return "伸びしろ（内容）";
    case "grammar":
      return "伸びしろ（文法）";
    case "both":
      return "伸びしろ（内容・文法）";
    default:
      return "要フォロー";
  }
}

function buildQuery(params: {
  from: string;
  to: string;
  taskId: string;
  student: string;
  publishedOnly: boolean;
}): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.taskId) q.set("taskId", params.taskId);
  if (params.student) q.set("student", params.student);
  if (!params.publishedOnly) q.set("publishedOnly", "0");
  return q.toString();
}

export function OpsReportsPageClient() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [taskId, setTaskId] = useState("");
  const [student, setStudent] = useState("");
  const [publishedOnly, setPublishedOnly] = useState(true);
  const [view, setView] = useState<ViewMode>("overview");
  /** null = 未選択初期（全件表示）。[] = 全解除 */
  const [selectedCategories, setSelectedCategories] = useState<GrammarCategoryId[] | null>(null);
  const categoriesPrimedRef = useRef(false);
  const [sourceViewer, setSourceViewer] = useState<{
    sources: WeaknessSourceRef[];
    title: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryData, setSummaryData] = useState<SummaryPayload | null>(null);
  const [weakData, setWeakData] = useState<WeaknessesPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) {
        setError("ログイン情報を取得できませんでした。再読み込みしてください。");
        return;
      }
      const token = await user.getIdToken();
      const qs = buildQuery({ from, to, taskId, student, publishedOnly });
      const headers = { Authorization: `Bearer ${token}` };
      const [sumRes, weakRes] = await Promise.all([
        fetch(`/api/ops/reports/summary?${qs}`, { headers }),
        fetch(`/api/ops/reports/weaknesses?${qs}`, { headers }),
      ]);
      const sumJson = (await sumRes.json()) as SummaryPayload;
      const weakJson = (await weakRes.json()) as WeaknessesPayload;
      if (!sumRes.ok || !sumJson.ok) {
        setError(sumJson.message ?? "集計の取得に失敗しました。");
        setSummaryData(null);
        setWeakData(null);
        return;
      }
      if (!weakRes.ok || !weakJson.ok) {
        setError(weakJson.message ?? "弱点集計の取得に失敗しました。");
      }
      setSummaryData(sumJson);
      setWeakData(weakJson.ok ? weakJson : null);
    } catch {
      setError("通信エラーで集計を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, [from, to, taskId, student, publishedOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = summaryData?.summary;
  const weaknesses = weakData?.weaknesses;
  const taskOptions = summaryData?.taskOptions ?? [];

  useEffect(() => {
    const cats = weaknesses?.categories;
    if (!cats?.length) return;
    const ids = cats.map((c) => c.id);
    if (!categoriesPrimedRef.current) {
      categoriesPrimedRef.current = true;
      setSelectedCategories(ids);
      return;
    }
    setSelectedCategories((prev) => {
      if (prev == null) return ids;
      const next = prev.filter((id) => ids.includes(id));
      return next.length === prev.length ? prev : next;
    });
  }, [weaknesses?.categories]);

  const categoryFilterIds = selectedCategories;
  const categoryFilterForUi: GrammarCategoryId[] =
    selectedCategories ?? (weaknesses?.categories.map((c) => c.id) ?? []);

  const filteredTopGrammar = useMemo(
    () => filterGrammarWeaknessesByCategories(weaknesses?.topGrammar ?? [], categoryFilterIds),
    [weaknesses?.topGrammar, categoryFilterIds],
  );
  const filteredPersonalGrammar = useMemo(
    () => filterGrammarWeaknessesByCategories(weaknesses?.personalGrammar ?? [], categoryFilterIds),
    [weaknesses?.personalGrammar, categoryFilterIds],
  );

  const periodLabel = useMemo(() => {
    if (from && to) return `${from} 〜 ${to}`;
    if (from) return `${from} 以降`;
    if (to) return `${to} まで`;
    return "全期間";
  }, [from, to]);

  const taskLabel = useMemo(() => {
    if (!taskId) return "全課題";
    const hit = taskOptions.find((t) => t.taskId === taskId);
    return hit ? `${hit.displayLabel}（${hit.taskId}）` : taskId;
  }, [taskId, taskOptions]);

  const personalName = useMemo(() => {
    if (!student || !summary?.students?.length) return student || "（未選択）";
    const hit = summary.students.find(
      (s) =>
        s.studentId.toLowerCase().includes(student.toLowerCase()) ||
        s.studentName.toLowerCase().includes(student.toLowerCase()),
    );
    return hit ? hit.studentName : student;
  }, [student, summary?.students]);

  const personalId = useMemo(() => {
    if (!summary?.students?.length) return student;
    const hit = summary.students.find(
      (s) =>
        s.studentId.toLowerCase().includes(student.toLowerCase()) ||
        s.studentName.toLowerCase().includes(student.toLowerCase()),
    );
    return hit?.studentId ?? student;
  }, [student, summary?.students]);

  const onFilterSubmit = (e: FormEvent) => {
    e.preventDefault();
    void load();
  };

  const blockEnterSubmit = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "textarea") return;
    if (tag === "button" && (e.target as HTMLButtonElement).type === "submit") return;
    e.preventDefault();
  };

  return (
    <main className="ops-reports">
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 教員ダッシュボード</Link>
      </p>
      <header className="ops-reports-hero">
        <h1>集計レポート</h1>
        <p className="ops-reports-lead">
          公開済みの添削結果から、内容点・文法点の傾向と頻出の伸びしろをまとめ、授業や個別指導の資料にします。
        </p>
      </header>

      <form
        className="ops-reports-filters"
        onSubmit={onFilterSubmit}
        onKeyDown={blockEnterSubmit}
        aria-label="集計条件"
      >
        <div className="ops-reports-filters-grid">
          <label className="ops-reports-field">
            <span>開始日</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="ops-reports-field">
            <span>終了日</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="ops-reports-field">
            <span>課題</span>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">すべて</option>
              {taskOptions.map((t) => (
                <option key={t.taskId} value={t.taskId}>
                  {t.displayLabel}（{t.taskId}）
                </option>
              ))}
            </select>
          </label>
          <label className="ops-reports-field">
            <span>生徒（学籍・氏名）</span>
            <input
              type="search"
              value={student}
              onChange={(e) => setStudent(e.target.value)}
              placeholder="空欄＝全員"
              autoComplete="off"
            />
          </label>
          <label className="ops-reports-check">
            <input
              type="checkbox"
              checked={publishedOnly}
              onChange={(e) => setPublishedOnly(e.target.checked)}
            />
            <span>公開済みのみ</span>
          </label>
        </div>
        <div className="ops-reports-filters-actions">
          <button type="submit" className="ops-reports-btn" disabled={loading}>
            {loading ? "集計中…" : "条件で集計"}
          </button>
          <button
            type="button"
            className="ops-reports-btn ops-reports-btn--ghost"
            onClick={() => window.print()}
          >
            印刷 / PDF
          </button>
        </div>
      </form>

      <nav className="ops-reports-tabs" aria-label="レポート表示切替">
        {(
          [
            ["overview", "クラス概要"],
            ["weaknesses", "弱点・授業ネタ"],
            ["personal", "個人カルテ"],
            ["handout-class", "配布（クラス）"],
            ["handout-personal", "配布（個人）"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`ops-reports-tab${view === id ? " is-active" : ""}`}
            onClick={() => setView(id)}
            aria-pressed={view === id}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? <p className="muted ops-reports-status">集計中…</p> : null}
      {error ? (
        <p className="ops-reports-error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && summary ? (
        <>
          <p className="ops-reports-meta muted">
            対象 {summary.matchedCount} 件 ／ 点数あり {summary.scoredCount} 件 ／ 公開{" "}
            {summary.publishedCount} 件 ／ 閲覧済 {summary.viewedCount} 件
          </p>

          {view === "overview" ? (
            <section className="ops-reports-panel" aria-label="クラス概要">
              <div className="ops-reports-stat-row">
                <div className="ops-reports-stat">
                  <span>平均・合計</span>
                  <strong>{fmt(summary.averages.total)}</strong>
                  <small>中央値 {fmt(summary.medians.total)}</small>
                </div>
                <div className="ops-reports-stat">
                  <span>平均・内容</span>
                  <strong>{fmt(summary.averages.content)}</strong>
                  <small>中央値 {fmt(summary.medians.content)}</small>
                </div>
                <div className="ops-reports-stat">
                  <span>平均・文法</span>
                  <strong>{fmt(summary.averages.grammar)}</strong>
                  <small>中央値 {fmt(summary.medians.grammar)}</small>
                </div>
              </div>

              <div className="ops-reports-charts">
                <OpsReportHistogram title="合計点の分布" bins={summary.histograms.total} accent="#0e7490" />
                <OpsReportHistogram title="内容点の分布" bins={summary.histograms.content} accent="#166534" />
                <OpsReportHistogram title="文法点の分布" bins={summary.histograms.grammar} accent="#9a3412" />
                <OpsReportScatter title="内容点 × 文法点" points={summary.scatter} />
              </div>

              <h2 className="ops-reports-h2">課題別サマリー</h2>
              {summary.byTask.length === 0 ? (
                <p className="muted">該当する課題がありません。</p>
              ) : (
                <div className="ops-reports-table-wrap">
                  <table className="ops-report-table">
                    <thead>
                      <tr>
                        <th>課題</th>
                        <th>件数</th>
                        <th>平均合計</th>
                        <th>平均内容</th>
                        <th>平均文法</th>
                        <th>低得点率</th>
                        <th>閲覧</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byTask.map((row) => (
                        <tr key={row.taskId}>
                          <td>
                            <span className="ops-reports-task-label">{row.displayLabel}</span>
                            <span className="muted ops-reports-task-id">{row.taskId}</span>
                          </td>
                          <td>{row.count}</td>
                          <td>{fmt(row.avgTotal)}</td>
                          <td>{fmt(row.avgContent)}</td>
                          <td>{fmt(row.avgGrammar)}</td>
                          <td>{row.lowScoreRate != null ? `${row.lowScoreRate}%` : "—"}</td>
                          <td>
                            {row.viewedCount}/{row.publishedCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2 className="ops-reports-h2">要フォロー</h2>
              {summary.followUp.length === 0 ? (
                <p className="muted">条件に該当する提出はありません。</p>
              ) : (
                <div className="ops-reports-table-wrap">
                  <table className="ops-report-table">
                    <thead>
                      <tr>
                        <th>生徒</th>
                        <th>課題</th>
                        <th>合計</th>
                        <th>内容減点</th>
                        <th>文法減点</th>
                        <th>観点</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.followUp.map((r) => (
                        <tr key={r.submissionId}>
                          <td>
                            {r.studentName}
                            <span className="muted">（{r.studentId}）</span>
                          </td>
                          <td>{r.taskId}</td>
                          <td>{fmt(r.scoreTotal)}</td>
                          <td>{fmt(r.contentDeduction)}</td>
                          <td>{fmt(r.grammarDeduction)}</td>
                          <td>{focusLabel(r.focus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}

          {view === "weaknesses" ? (
            <section className="ops-reports-panel" aria-label="弱点・授業ネタ">
              <p className="muted">
                添削コメントの「誤 → 正」行を集計しています（{weaknesses?.grammarBulletCount ?? 0}{" "}
                行 → ユニーク表現 {weaknesses?.grammarItemCount ?? 0} 件）。表記ゆれは完全にはまとめきれません。
              </p>

              <OpsReportCategoryFilter
                categories={weaknesses?.categories ?? []}
                selectedIds={categoryFilterForUi}
                onChange={setSelectedCategories}
              />

              <h2 className="ops-reports-h2">
                文法・語法・表現のミス
                <span className="ops-reports-h2-count">
                  （表示 {filteredTopGrammar.length} / {weaknesses?.grammarItemCount ?? 0}）
                </span>
              </h2>
              {!weaknesses?.topGrammar?.length ? (
                <p className="muted">抽出できる文法箇条書きがありませんでした。</p>
              ) : filteredTopGrammar.length === 0 ? (
                <p className="muted">選択中のカテゴリに該当する項目がありません。プルダウンで種類を選んでください。</p>
              ) : (
                <ol className="ops-reports-weak-list">
                  {filteredTopGrammar.map((w) => (
                    <li key={w.key}>
                      <p className="ops-reports-weak-cat">
                        <span className="ops-reports-cat-badge">{w.categoryLabel}</span>
                      </p>
                      <p className="ops-report-handout-pair">
                        <span className="ops-report-handout-wrong">{w.wrong}</span>
                        <span aria-hidden> → </span>
                        <span className="ops-report-handout-correct">{w.correct}</span>
                        <span className="ops-report-handout-count">{w.count}件</span>
                      </p>
                      {w.sampleReason ? <p className="ops-report-handout-reason">{w.sampleReason}</p> : null}
                      {w.sources?.length ? (
                        <div className="ops-reports-source-actions no-print">
                          <button
                            type="button"
                            className="ops-reports-open-source"
                            onClick={() =>
                              setSourceViewer({
                                sources: w.sources,
                                title: `${w.wrong} → ${w.correct}`,
                              })
                            }
                          >
                            元データを開く
                            {w.sources.length > 1 ? `（${w.sources.length}件）` : ""}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}

              <h2 className="ops-reports-h2">内容の改善テーマ</h2>
              {!weaknesses?.contentThemes?.length ? (
                <p className="muted">内容コメントから抽出できる改善点はありませんでした。</p>
              ) : (
                <ul className="ops-reports-theme-list">
                  {weaknesses.contentThemes.map((t) => (
                    <li key={t.key}>
                      <span>{t.label}</span>
                      <span className="ops-report-handout-count">{t.count}</span>
                      {t.sources?.length ? (
                        <div className="ops-reports-source-actions no-print">
                          <button
                            type="button"
                            className="ops-reports-open-source"
                            onClick={() =>
                              setSourceViewer({
                                sources: t.sources,
                                title: t.label,
                              })
                            }
                          >
                            元データを開く
                            {t.sources.length > 1 ? `（${t.sources.length}件）` : ""}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {view === "personal" ? (
            <section className="ops-reports-panel" aria-label="個人カルテ">
              {!student.trim() ? (
                <p className="muted">上の「生徒」欄に学籍または氏名を入れて集計してください。</p>
              ) : (
                <>
                  <h2 className="ops-reports-h2">
                    {personalName}
                    <span className="muted">（{personalId}）</span>
                  </h2>
                  <OpsReportTrend
                    title="合計点の推移"
                    points={summary.personalTrend.map((r) => ({
                      label: r.taskId,
                      total: r.scoreTotal,
                      content: r.content,
                      grammar: r.grammar,
                    }))}
                  />
                  <div className="ops-reports-table-wrap">
                    <table className="ops-report-table">
                      <thead>
                        <tr>
                          <th>課題</th>
                          <th>日付</th>
                          <th>内容</th>
                          <th>文法</th>
                          <th>合計</th>
                          <th>閲覧</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.personalTrend.map((r) => (
                          <tr key={r.submissionId}>
                            <td>{r.taskId}</td>
                            <td>{formatDate(r.approvedAt || r.submittedAt)}</td>
                            <td>{fmt(r.content)}</td>
                            <td>{fmt(r.grammar)}</td>
                            <td>{fmt(r.scoreTotal)}</td>
                            <td>{r.viewed ? "済" : "未"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h2 className="ops-reports-h2">復習したい表現</h2>
                  <OpsReportCategoryFilter
                    categories={weaknesses?.categories ?? []}
                    selectedIds={categoryFilterForUi}
                    onChange={setSelectedCategories}
                  />
                  {!weaknesses?.personalGrammar?.length ? (
                    <p className="muted">この条件では文法箇条書きがありません。</p>
                  ) : filteredPersonalGrammar.length === 0 ? (
                    <p className="muted">選択中のカテゴリに該当する項目がありません。</p>
                  ) : (
                    <ol className="ops-reports-weak-list">
                      {filteredPersonalGrammar.map((w) => (
                        <li key={w.key}>
                          <p className="ops-reports-weak-cat">
                            <span className="ops-reports-cat-badge">{w.categoryLabel}</span>
                          </p>
                          <p className="ops-report-handout-pair">
                            <span className="ops-report-handout-wrong">{w.wrong}</span>
                            <span aria-hidden> → </span>
                            <span className="ops-report-handout-correct">{w.correct}</span>
                          </p>
                          {w.sampleReason ? <p className="ops-report-handout-reason">{w.sampleReason}</p> : null}
                          {w.sources?.length ? (
                            <div className="ops-reports-source-actions no-print">
                              <button
                                type="button"
                                className="ops-reports-open-source"
                                onClick={() =>
                                  setSourceViewer({
                                    sources: w.sources,
                                    title: `${w.wrong} → ${w.correct}`,
                                  })
                                }
                              >
                                元データを開く
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </section>
          ) : null}

          {view === "handout-class" ? (
            <section className="ops-reports-panel ops-reports-panel--print" aria-label="クラス配布">
              <div className="ops-reports-print-controls no-print">
                <OpsReportCategoryFilter
                  categories={weaknesses?.categories ?? []}
                  selectedIds={categoryFilterForUi}
                  onChange={setSelectedCategories}
                />
              </div>
              <OpsReportClassHandout
                title="答案分析・授業ネタ"
                periodLabel={periodLabel}
                taskLabel={taskLabel}
                averages={summary.averages}
                topGrammar={filteredTopGrammar}
                contentThemes={weaknesses?.contentThemes ?? []}
              />
            </section>
          ) : null}

          {view === "handout-personal" ? (
            <section className="ops-reports-panel ops-reports-panel--print" aria-label="個人配布">
              {!student.trim() ? (
                <p className="muted">個人配布には「生徒」の指定が必要です。</p>
              ) : (
                <>
                  <div className="ops-reports-print-controls no-print">
                    <OpsReportCategoryFilter
                      categories={weaknesses?.categories ?? []}
                      selectedIds={categoryFilterForUi}
                      onChange={setSelectedCategories}
                    />
                  </div>
                  <OpsReportPersonalHandout
                    studentName={personalName}
                    studentId={personalId}
                    periodLabel={`${periodLabel} ／ ${taskLabel}`}
                    trend={summary.personalTrend}
                    personalGrammar={filteredPersonalGrammar}
                  />
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {sourceViewer ? (
        <OpsReportSourceViewer
          sources={sourceViewer.sources}
          title={sourceViewer.title}
          onClose={() => setSourceViewer(null)}
        />
      ) : null}
    </main>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ja-JP");
  } catch {
    return iso.slice(0, 10);
  }
}
