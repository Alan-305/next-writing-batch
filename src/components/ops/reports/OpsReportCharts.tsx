"use client";

import type { HistogramBin } from "@/lib/ops/reports/build-report-summary";

type HistProps = {
  title: string;
  bins: HistogramBin[];
  accent?: string;
};

export function OpsReportHistogram({ title, bins, accent = "#0e7490" }: HistProps) {
  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const w = 360;
  const h = 140;
  const padL = 28;
  const padB = 28;
  const padT = 12;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const gap = 4;
  const barW = bins.length > 0 ? (innerW - gap * (bins.length - 1)) / bins.length : 0;

  return (
    <figure className="ops-report-chart">
      <figcaption className="ops-report-chart-title">{title}</figcaption>
      {bins.length === 0 ? (
        <p className="muted ops-report-chart-empty">データがありません</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="ops-report-chart-svg" role="img" aria-label={title}>
          {[0, 0.5, 1].map((t) => {
            const y = padT + innerH * (1 - t);
            const val = Math.round(maxCount * t);
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={w - padR} y2={y} className="ops-report-chart-grid" />
                <text x={padL - 6} y={y + 3} textAnchor="end" className="ops-report-chart-axis">
                  {val}
                </text>
              </g>
            );
          })}
          {bins.map((b, i) => {
            const bh = (b.count / maxCount) * innerH;
            const x = padL + i * (barW + gap);
            const y = padT + innerH - bh;
            return (
              <g key={b.label}>
                <rect x={x} y={y} width={Math.max(barW, 1)} height={Math.max(bh, b.count > 0 ? 2 : 0)} fill={accent} rx={3} />
                <text
                  x={x + barW / 2}
                  y={h - 8}
                  textAnchor="middle"
                  className="ops-report-chart-axis ops-report-chart-axis--x"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

type ScatterProps = {
  title: string;
  points: Array<{ content: number; grammar: number; scoreTotal: number | null }>;
  contentMax?: number;
  grammarMax?: number;
};

export function OpsReportScatter({ title, points, contentMax = 25, grammarMax = 25 }: ScatterProps) {
  const w = 360;
  const h = 220;
  const padL = 36;
  const padB = 36;
  const padT = 12;
  const padR = 12;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const cxMax = Math.max(contentMax, ...points.map((p) => p.content), 1);
  const gyMax = Math.max(grammarMax, ...points.map((p) => p.grammar), 1);

  return (
    <figure className="ops-report-chart">
      <figcaption className="ops-report-chart-title">{title}</figcaption>
      {points.length === 0 ? (
        <p className="muted ops-report-chart-empty">データがありません</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="ops-report-chart-svg" role="img" aria-label={title}>
          <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} className="ops-report-chart-axis-line" />
          <line
            x1={padL}
            y1={padT + innerH}
            x2={padL + innerW}
            y2={padT + innerH}
            className="ops-report-chart-axis-line"
          />
          <text x={padL + innerW / 2} y={h - 6} textAnchor="middle" className="ops-report-chart-axis">
            内容点
          </text>
          <text
            x={12}
            y={padT + innerH / 2}
            textAnchor="middle"
            className="ops-report-chart-axis"
            transform={`rotate(-90 12 ${padT + innerH / 2})`}
          >
            文法点
          </text>
          {points.map((p, i) => {
            const x = padL + (p.content / cxMax) * innerW;
            const y = padT + innerH - (p.grammar / gyMax) * innerH;
            return <circle key={i} cx={x} cy={y} r={5} className="ops-report-scatter-dot" />;
          })}
        </svg>
      )}
    </figure>
  );
}

type TrendProps = {
  title: string;
  points: Array<{ label: string; total: number | null; content: number | null; grammar: number | null }>;
};

export function OpsReportTrend({ title, points }: TrendProps) {
  const scored = points.filter((p) => p.total != null);
  const w = 420;
  const h = 180;
  const padL = 32;
  const padB = 40;
  const padT = 12;
  const padR = 12;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const maxY = Math.max(50, ...scored.map((p) => p.total ?? 0));

  return (
    <figure className="ops-report-chart">
      <figcaption className="ops-report-chart-title">{title}</figcaption>
      {scored.length === 0 ? (
        <p className="muted ops-report-chart-empty">推移データがありません</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="ops-report-chart-svg" role="img" aria-label={title}>
          <line
            x1={padL}
            y1={padT + innerH}
            x2={padL + innerW}
            y2={padT + innerH}
            className="ops-report-chart-axis-line"
          />
          {scored.map((p, i) => {
            const x = padL + (scored.length === 1 ? innerW / 2 : (i / (scored.length - 1)) * innerW);
            const y = padT + innerH - ((p.total ?? 0) / maxY) * innerH;
            const prev = scored[i - 1];
            const prevX =
              i > 0
                ? padL + (scored.length === 1 ? innerW / 2 : ((i - 1) / (scored.length - 1)) * innerW)
                : x;
            const prevY =
              i > 0 && prev ? padT + innerH - ((prev.total ?? 0) / maxY) * innerH : y;
            return (
              <g key={`${p.label}-${i}`}>
                {i > 0 ? (
                  <line x1={prevX} y1={prevY} x2={x} y2={y} className="ops-report-trend-line" />
                ) : null}
                <circle cx={x} cy={y} r={5} className="ops-report-scatter-dot" />
                <text x={x} y={h - 10} textAnchor="middle" className="ops-report-chart-axis ops-report-chart-axis--x">
                  {p.label.length > 10 ? `${p.label.slice(0, 9)}…` : p.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}
