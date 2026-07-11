"use client";

import type { AggregatedGrammarWeakness } from "@/lib/ops/reports/parse-grammar-bullets";
import type { ReportScoreRow } from "@/lib/ops/reports/build-report-summary";

type ClassHandoutProps = {
  title: string;
  periodLabel: string;
  taskLabel: string;
  averages: { total: number | null; content: number | null; grammar: number | null };
  topGrammar: AggregatedGrammarWeakness[];
  contentThemes: Array<{ label: string; count: number }>;
};

/** クラス配布用（氏名なし） */
export function OpsReportClassHandout({
  title,
  periodLabel,
  taskLabel,
  averages,
  topGrammar,
  contentThemes,
}: ClassHandoutProps) {
  return (
    <article className="ops-report-handout" data-handout="class">
      <header className="ops-report-handout-header">
        <p className="ops-report-handout-kicker">指導用資料（クラス）</p>
        <h2>{title}</h2>
        <p className="ops-report-handout-meta">
          {periodLabel}
          {taskLabel ? ` ／ ${taskLabel}` : ""}
        </p>
      </header>

      <section className="ops-report-handout-section">
        <h3>今回の平均点</h3>
        <ul className="ops-report-handout-stats">
          <li>
            <span>合計</span>
            <strong>{fmt(averages.total)}</strong>
          </li>
          <li>
            <span>内容</span>
            <strong>{fmt(averages.content)}</strong>
          </li>
          <li>
            <span>文法・語法</span>
            <strong>{fmt(averages.grammar)}</strong>
          </li>
        </ul>
      </section>

      <section className="ops-report-handout-section">
        <h3>よく見られた文法・語法の伸びしろ</h3>
        {topGrammar.length === 0 ? (
          <p className="muted">該当する箇条書きがありませんでした。</p>
        ) : (
          <ol className="ops-report-handout-mistakes">
            {topGrammar.slice(0, 12).map((w) => (
              <li key={w.key}>
                {"categoryLabel" in w && w.categoryLabel ? (
                  <p className="ops-reports-weak-cat">
                    <span className="ops-reports-cat-badge">{w.categoryLabel}</span>
                  </p>
                ) : null}
                <p className="ops-report-handout-pair">
                  <span className="ops-report-handout-wrong">{w.wrong}</span>
                  <span aria-hidden> → </span>
                  <span className="ops-report-handout-correct">{w.correct}</span>
                  <span className="ops-report-handout-count">（{w.count}件）</span>
                </p>
                {w.sampleReason ? <p className="ops-report-handout-reason">{w.sampleReason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {contentThemes.length > 0 ? (
        <section className="ops-report-handout-section">
          <h3>内容面で意識したいこと</h3>
          <ul className="ops-report-handout-themes">
            {contentThemes.slice(0, 6).map((t) => (
              <li key={t.label}>
                {t.label}
                <span className="ops-report-handout-count">（{t.count}）</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="ops-report-handout-footer">
        <p>氏名は記載していません。授業・配布用の匿名資料です。</p>
      </footer>
    </article>
  );
}

type PersonalHandoutProps = {
  studentName: string;
  studentId: string;
  periodLabel: string;
  trend: ReportScoreRow[];
  personalGrammar: AggregatedGrammarWeakness[];
};

/** 個人カルテ（実名あり） */
export function OpsReportPersonalHandout({
  studentName,
  studentId,
  periodLabel,
  trend,
  personalGrammar,
}: PersonalHandoutProps) {
  return (
    <article className="ops-report-handout" data-handout="personal">
      <header className="ops-report-handout-header">
        <p className="ops-report-handout-kicker">指導用資料（個人）</p>
        <h2>
          {studentName}
          <span className="ops-report-handout-sid">（{studentId}）</span>
        </h2>
        <p className="ops-report-handout-meta">{periodLabel}</p>
      </header>

      <section className="ops-report-handout-section">
        <h3>点数の推移</h3>
        {trend.length === 0 ? (
          <p className="muted">該当する提出がありません。</p>
        ) : (
          <table className="ops-report-table">
            <thead>
              <tr>
                <th>課題</th>
                <th>日付</th>
                <th>内容</th>
                <th>文法</th>
                <th>合計</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((r) => (
                <tr key={r.submissionId}>
                  <td>{r.taskId}</td>
                  <td>{formatDate(r.approvedAt || r.submittedAt)}</td>
                  <td>{fmt(r.content)}</td>
                  <td>{fmt(r.grammar)}</td>
                  <td>{fmt(r.scoreTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ops-report-handout-section">
        <h3>復習したい表現</h3>
        {personalGrammar.length === 0 ? (
          <p className="muted">抽出できた文法箇条書きがありません。</p>
        ) : (
          <ol className="ops-report-handout-mistakes">
            {personalGrammar.slice(0, 20).map((w) => (
              <li key={w.key}>
                {"categoryLabel" in w && w.categoryLabel ? (
                  <p className="ops-reports-weak-cat">
                    <span className="ops-reports-cat-badge">{w.categoryLabel}</span>
                  </p>
                ) : null}
                <p className="ops-report-handout-pair">
                  <span className="ops-report-handout-wrong">{w.wrong}</span>
                  <span aria-hidden> → </span>
                  <span className="ops-report-handout-correct">{w.correct}</span>
                </p>
                {w.sampleReason ? <p className="ops-report-handout-reason">{w.sampleReason}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
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
