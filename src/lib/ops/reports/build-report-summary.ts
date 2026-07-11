import type { Submission } from "@/lib/submissions-store";

export type ReportFilterInput = {
  from?: string | null;
  to?: string | null;
  taskIds?: string[] | null;
  /** 学籍・氏名・submittedByUid のいずれかに部分一致 */
  studentQuery?: string | null;
  /** デフォルト true: operatorApprovedAt がある提出のみ */
  publishedOnly?: boolean;
};

export type ReportScoreRow = {
  submissionId: string;
  taskId: string;
  studentId: string;
  studentName: string;
  submittedByUid: string | null;
  submittedAt: string;
  approvedAt: string | null;
  content: number | null;
  grammar: number | null;
  scoreTotal: number | null;
  contentDeduction: number | null;
  grammarDeduction: number | null;
  viewed: boolean;
};

export type HistogramBin = {
  label: string;
  from: number;
  to: number;
  count: number;
};

export type TaskScoreSummary = {
  taskId: string;
  count: number;
  scoredCount: number;
  avgTotal: number | null;
  avgContent: number | null;
  avgGrammar: number | null;
  lowScoreRate: number | null;
  viewedCount: number;
  publishedCount: number;
};

export type ReportSummaryResult = {
  matchedCount: number;
  scoredCount: number;
  publishedCount: number;
  viewedCount: number;
  averages: { total: number | null; content: number | null; grammar: number | null };
  medians: { total: number | null; content: number | null; grammar: number | null };
  histograms: {
    total: HistogramBin[];
    content: HistogramBin[];
    grammar: HistogramBin[];
  };
  scatter: Array<{ submissionId: string; content: number; grammar: number; scoreTotal: number | null }>;
  byTask: TaskScoreSummary[];
  followUp: Array<{
    submissionId: string;
    taskId: string;
    studentId: string;
    studentName: string;
    scoreTotal: number | null;
    contentDeduction: number | null;
    grammarDeduction: number | null;
    focus: "content" | "grammar" | "both" | "total";
  }>;
  personalTrend: ReportScoreRow[];
  students: Array<{ key: string; studentId: string; studentName: string; count: number }>;
  taskIds: string[];
  rows: ReportScoreRow[];
};

function parseIsoBound(raw: string | null | undefined, endOfDay: boolean): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = endOfDay ? `${s}T23:59:59.999` : `${s}T00:00:00.000`;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? null;
}

function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

function scoreFromRecord(scores: Record<string, number> | undefined, id: string): number | null {
  if (!scores) return null;
  const v = scores[id];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function pickContentGrammar(scores: Record<string, number> | undefined): {
  content: number | null;
  grammar: number | null;
} {
  if (!scores) return { content: null, grammar: null };
  let content = scoreFromRecord(scores, "content");
  let grammar = scoreFromRecord(scores, "grammar");
  if (content == null) {
    const hit = Object.entries(scores).find(([k]) => /content|内容/i.test(k));
    if (hit && Number.isFinite(hit[1])) content = hit[1];
  }
  if (grammar == null) {
    const hit = Object.entries(scores).find(([k]) => /grammar|文法|語法/i.test(k));
    if (hit && Number.isFinite(hit[1])) grammar = hit[1];
  }
  return { content, grammar };
}

function isPublished(s: Submission): boolean {
  return Boolean(String(s.studentRelease?.operatorApprovedAt ?? "").trim());
}

function rowDateMs(s: Submission, publishedOnly: boolean): number | null {
  const approved = String(s.studentRelease?.operatorApprovedAt ?? "").trim();
  const submitted = String(s.submittedAt ?? "").trim();
  const iso = publishedOnly && approved ? approved : submitted || approved;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function submissionMatchesReportFilters(s: Submission, filters: ReportFilterInput): boolean {
  const publishedOnly = filters.publishedOnly !== false;
  if (publishedOnly && !isPublished(s)) return false;
  if (!publishedOnly) {
    // 未公開も含める場合でも、点数のある studentRelease が無い提出は後段で scored から外す
  }

  const fromMs = parseIsoBound(filters.from, false);
  const toMs = parseIsoBound(filters.to, true);
  const ms = rowDateMs(s, publishedOnly);
  if (fromMs != null && (ms == null || ms < fromMs)) return false;
  if (toMs != null && (ms == null || ms > toMs)) return false;

  const taskIds = (filters.taskIds ?? []).map((t) => t.trim()).filter(Boolean);
  if (taskIds.length > 0) {
    const tid = String(s.taskId ?? "").trim();
    if (!taskIds.includes(tid)) return false;
  }

  const q = (filters.studentQuery ?? "").trim().toLowerCase();
  if (q) {
    const hay = [
      String(s.studentId ?? ""),
      String(s.studentName ?? ""),
      String(s.submittedByUid ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

export function toReportScoreRow(s: Submission): ReportScoreRow {
  const sr = s.studentRelease;
  const { content, grammar } = pickContentGrammar(sr?.scores);
  const scoreTotal =
    typeof sr?.scoreTotal === "number" && Number.isFinite(sr.scoreTotal) ? sr.scoreTotal : null;
  return {
    submissionId: s.submissionId,
    taskId: String(s.taskId ?? "").trim() || "—",
    studentId: String(s.studentId ?? "").trim() || "—",
    studentName: String(s.studentName ?? "").trim() || "—",
    submittedByUid: String(s.submittedByUid ?? "").trim() || null,
    submittedAt: String(s.submittedAt ?? ""),
    approvedAt: String(sr?.operatorApprovedAt ?? "").trim() || null,
    content,
    grammar,
    scoreTotal,
    contentDeduction:
      typeof sr?.contentDeduction === "number" && Number.isFinite(sr.contentDeduction)
        ? sr.contentDeduction
        : null,
    grammarDeduction:
      typeof sr?.grammarDeduction === "number" && Number.isFinite(sr.grammarDeduction)
        ? sr.grammarDeduction
        : null,
    viewed: Boolean(String(s.studentResultFirstViewedAt ?? "").trim()),
  };
}

function buildHistogram(values: number[], binSize: number, maxCap?: number): HistogramBin[] {
  if (values.length === 0) return [];
  const observedMax = Math.max(...values);
  const maxVal = Math.max(maxCap ?? observedMax, binSize);
  const bins: HistogramBin[] = [];
  for (let from = 0; from < maxVal; from += binSize) {
    const to = Math.min(from + binSize, maxVal);
    bins.push({
      label: from + binSize >= maxVal ? `${from}–${maxVal}` : `${from}–${to}`,
      from,
      to: from + binSize,
      count: 0,
    });
    if (from + binSize >= maxVal) break;
  }
  const lastIdx = bins.length - 1;
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i]!;
      const isLast = i === lastIdx;
      if (isLast ? v >= b.from && v <= b.to : v >= b.from && v < b.to) {
        b.count += 1;
        placed = true;
        break;
      }
    }
    if (!placed && lastIdx >= 0) bins[lastIdx]!.count += 1;
  }
  return bins;
}

const LOW_SCORE_RATIO = 0.6;

export function buildReportSummary(
  submissions: Submission[],
  filters: ReportFilterInput,
  options?: { lowScoreThresholdRatio?: number },
): ReportSummaryResult {
  const matched = submissions.filter((s) => submissionMatchesReportFilters(s, filters));
  const rows = matched.map(toReportScoreRow);
  const scored = rows.filter((r) => r.scoreTotal != null || r.content != null || r.grammar != null);
  const totals = scored.map((r) => r.scoreTotal).filter((n): n is number => n != null);
  const contents = scored.map((r) => r.content).filter((n): n is number => n != null);
  const grammars = scored.map((r) => r.grammar).filter((n): n is number => n != null);

  const maxTotal = totals.length ? Math.max(...totals, 50) : 50;
  const maxContent = contents.length ? Math.max(...contents, 25) : 25;
  const maxGrammar = grammars.length ? Math.max(...grammars, 25) : 25;

  const byTaskMap = new Map<
    string,
    {
      count: number;
      totals: number[];
      contents: number[];
      grammars: number[];
      viewedCount: number;
      publishedCount: number;
    }
  >();

  for (const r of rows) {
    const cur = byTaskMap.get(r.taskId) ?? {
      count: 0,
      totals: [],
      contents: [],
      grammars: [],
      viewedCount: 0,
      publishedCount: 0,
    };
    cur.count += 1;
    if (r.approvedAt) cur.publishedCount += 1;
    if (r.viewed) cur.viewedCount += 1;
    if (r.scoreTotal != null) cur.totals.push(r.scoreTotal);
    if (r.content != null) cur.contents.push(r.content);
    if (r.grammar != null) cur.grammars.push(r.grammar);
    byTaskMap.set(r.taskId, cur);
  }

  const ratio = options?.lowScoreThresholdRatio ?? LOW_SCORE_RATIO;
  const byTask: TaskScoreSummary[] = Array.from(byTaskMap.entries())
    .map(([taskId, v]) => {
      const avgTotal = mean(v.totals);
      const lowCount =
        avgTotal == null
          ? 0
          : v.totals.filter((t) => {
              const cap = Math.max(...v.totals, 1);
              return t < cap * ratio;
            }).length;
      return {
        taskId,
        count: v.count,
        scoredCount: v.totals.length,
        avgTotal: round1(avgTotal),
        avgContent: round1(mean(v.contents)),
        avgGrammar: round1(mean(v.grammars)),
        lowScoreRate: v.totals.length ? round1((lowCount / v.totals.length) * 100) : null,
        viewedCount: v.viewedCount,
        publishedCount: v.publishedCount,
      };
    })
    .sort((a, b) => (b.avgTotal ?? -1) - (a.avgTotal ?? -1) || a.taskId.localeCompare(b.taskId, "ja"));

  const followUp = scored
    .map((r) => {
      const cd = r.contentDeduction ?? 0;
      const gd = r.grammarDeduction ?? 0;
      let focus: "content" | "grammar" | "both" | "total" = "total";
      if (cd >= 5 && gd >= 5) focus = "both";
      else if (cd >= gd && cd >= 4) focus = "content";
      else if (gd > cd && gd >= 4) focus = "grammar";
      else if ((r.scoreTotal ?? 99) <= 30) focus = "total";
      else if (cd < 4 && gd < 4 && (r.scoreTotal ?? 99) > 30) return null;
      return {
        submissionId: r.submissionId,
        taskId: r.taskId,
        studentId: r.studentId,
        studentName: r.studentName,
        scoreTotal: r.scoreTotal,
        contentDeduction: r.contentDeduction,
        grammarDeduction: r.grammarDeduction,
        focus,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => {
      const da = (a.contentDeduction ?? 0) + (a.grammarDeduction ?? 0);
      const db = (b.contentDeduction ?? 0) + (b.grammarDeduction ?? 0);
      return db - da || (a.scoreTotal ?? 0) - (b.scoreTotal ?? 0);
    })
    .slice(0, 30);

  const studentMap = new Map<string, { studentId: string; studentName: string; count: number }>();
  for (const r of rows) {
    const key = `${r.studentId}::${r.studentName}`;
    const cur = studentMap.get(key);
    if (!cur) studentMap.set(key, { studentId: r.studentId, studentName: r.studentName, count: 1 });
    else cur.count += 1;
  }

  const personalTrend = [...rows].sort((a, b) => {
    const aa = a.approvedAt || a.submittedAt;
    const bb = b.approvedAt || b.submittedAt;
    return aa.localeCompare(bb);
  });

  return {
    matchedCount: rows.length,
    scoredCount: scored.length,
    publishedCount: rows.filter((r) => r.approvedAt).length,
    viewedCount: rows.filter((r) => r.viewed).length,
    averages: {
      total: round1(mean(totals)),
      content: round1(mean(contents)),
      grammar: round1(mean(grammars)),
    },
    medians: {
      total: round1(median(totals)),
      content: round1(median(contents)),
      grammar: round1(median(grammars)),
    },
    histograms: {
      total: buildHistogram(totals, 5, Math.ceil(maxTotal / 5) * 5),
      content: buildHistogram(contents, 5, Math.ceil(maxContent / 5) * 5),
      grammar: buildHistogram(grammars, 5, Math.ceil(maxGrammar / 5) * 5),
    },
    scatter: scored
      .filter((r): r is ReportScoreRow & { content: number; grammar: number } => r.content != null && r.grammar != null)
      .map((r) => ({
        submissionId: r.submissionId,
        content: r.content,
        grammar: r.grammar,
        scoreTotal: r.scoreTotal,
      })),
    byTask,
    followUp,
    personalTrend,
    students: Array.from(studentMap.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count || a.studentName.localeCompare(b.studentName, "ja")),
    taskIds: Array.from(new Set(rows.map((r) => r.taskId))).sort((a, b) => a.localeCompare(b, "ja")),
    rows,
  };
}

export function parseReportFilterSearchParams(url: URL): ReportFilterInput {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const studentQuery = url.searchParams.get("student") ?? url.searchParams.get("studentQuery");
  const publishedRaw = url.searchParams.get("publishedOnly");
  const publishedOnly = publishedRaw == null ? true : publishedRaw !== "0" && publishedRaw !== "false";
  const taskRaw = url.searchParams.get("taskId") ?? url.searchParams.get("taskIds") ?? "";
  const taskIds = taskRaw
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return { from, to, studentQuery, publishedOnly, taskIds };
}
