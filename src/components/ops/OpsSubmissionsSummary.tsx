"use client";

type Stat = {
  key: string;
  label: string;
  value: number;
  hint: string;
  accentClass: string;
};

type Props = {
  pending: number;
  inProgress: number;
  failed: number;
  done: number;
  viewed: number;
  total: number;
};

export function OpsSubmissionsSummary({
  pending,
  inProgress,
  failed,
  done,
  viewed,
  total,
}: Props) {
  const stats: Stat[] = [
    {
      key: "pending",
      label: "未添削",
      value: pending,
      hint: "添削待ち",
      accentClass: "ops-stat-card--pending",
    },
    {
      key: "progress",
      label: "処理中",
      value: inProgress,
      hint: "待機中・添削中",
      accentClass: "ops-stat-card--progress",
    },
    {
      key: "failed",
      label: "要再実行",
      value: failed,
      hint: "失敗・再預け",
      accentClass: "ops-stat-card--failed",
    },
    {
      key: "done",
      label: "完了",
      value: done,
      hint: "添削済み",
      accentClass: "ops-stat-card--done",
    },
    {
      key: "viewed",
      label: "閲覧済",
      value: viewed,
      hint: "生徒が確認",
      accentClass: "ops-stat-card--viewed",
    },
  ];

  return (
    <section className="ops-summary" aria-label="提出サマリー">
      <div className="ops-summary__total">
        <span className="ops-summary__total-label">提出総数</span>
        <span className="ops-summary__total-value">{total}</span>
        <span className="ops-summary__total-unit">件</span>
      </div>
      <div className="ops-summary__grid">
        {stats.map((s) => (
          <article key={s.key} className={`ops-stat-card ${s.accentClass}`}>
            <p className="ops-stat-card__label">{s.label}</p>
            <p className="ops-stat-card__value">{s.value}</p>
            <p className="ops-stat-card__hint">{s.hint}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
