/** クライアント・サーバー共通（Node の fs/path に依存しない） */

export type TaskRubricItem = {
  id: string;
  label: string;
  max: number;
};

export type TaskRubric = {
  maxTotal: number;
  items: TaskRubricItem[];
};

export type TaskProblemEntry = {
  problemId: string;
  title: string;
  question: string;
};

export type TaskProblemsMaster = {
  taskId: string;
  rubric: TaskRubric;
  problems: TaskProblemEntry[];
};

export function parseTaskProblemsMaster(raw: unknown): TaskProblemsMaster | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const taskId = typeof o.taskId === "string" ? o.taskId.trim() : "";
  const rub = o.rubric;
  if (!rub || typeof rub !== "object") return null;
  const r = rub as Record<string, unknown>;
  const maxTotal = typeof r.maxTotal === "number" && Number.isFinite(r.maxTotal) ? r.maxTotal : 0;
  const itemsRaw = r.items;
  if (!Array.isArray(itemsRaw)) return null;
  const items: TaskRubricItem[] = [];
  for (const it of itemsRaw) {
    if (!it || typeof it !== "object") return null;
    const row = it as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const max = typeof row.max === "number" && Number.isFinite(row.max) ? row.max : 0;
    if (!id || max <= 0) return null;
    items.push({ id, label: label || id, max });
  }
  const probs = o.problems;
  if (!Array.isArray(probs)) return null;
  const problems: TaskProblemEntry[] = [];
  for (const p of probs) {
    if (!p || typeof p !== "object") return null;
    const row = p as Record<string, unknown>;
    const problemId = typeof row.problemId === "string" ? row.problemId.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const question = typeof row.question === "string" ? row.question : "";
    if (!problemId) return null;
    problems.push({ problemId, title: title || problemId, question });
  }
  if (!taskId || items.length === 0) return null;
  return { taskId, rubric: { maxTotal: maxTotal > 0 ? maxTotal : items.reduce((s, i) => s + i.max, 0), items }, problems };
}

export function pickQuestion(master: TaskProblemsMaster, problemId: string): string | null {
  const id = problemId.trim();
  if (!id) return null;
  const hit = master.problems.find((p) => p.problemId === id);
  return hit ? hit.question.trim() : null;
}

/** Clamp each item score and sum (やり方A: 合計は常にルーブリックから再計算可能) */
export function computeScoreTotal(master: TaskProblemsMaster, scores: Record<string, number>): number {
  let sum = 0;
  for (const it of master.rubric.items) {
    let v = scores[it.id];
    if (typeof v !== "number" || Number.isNaN(v)) v = 0;
    if (v < 0) v = 0;
    if (v > it.max) v = it.max;
    sum += v;
  }
  const cap = master.rubric.maxTotal > 0 ? master.rubric.maxTotal : sum;
  return Math.min(sum, cap);
}

/** 生徒向け・PDF 用の短い得点テキスト（ルーブリック数値からのみ生成） */
export function formatRubricEvaluationSummary(
  master: TaskProblemsMaster,
  scores: Record<string, number>,
  scoreTotal?: number,
): string {
  const total = scoreTotal ?? computeScoreTotal(master, scores);
  const lines: string[] = [];
  for (const it of master.rubric.items) {
    let v = scores[it.id];
    if (typeof v !== "number" || Number.isNaN(v)) v = 0;
    if (v < 0) v = 0;
    if (v > it.max) v = it.max;
    lines.push(`${it.label}: ${v}点`);
  }
  lines.push(`合計: ${total}点`);
  return lines.join("\n");
}
