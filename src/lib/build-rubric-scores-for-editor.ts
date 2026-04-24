import { clampInt, type ProofreadingSetupJson } from "@/lib/proofreading-setup-json";
import type { TaskProblemsMaster } from "@/lib/task-problems-core";

/**
 * 課題・添削設定の「内容点（満点）」「文法点（満点）」を、ルーブリック id `content` / `grammar` の既定付け点に写す。
 * （マスタに該当 id が無い項目は無視）
 */
export function defaultScoresFromTeacherSetup(
  master: TaskProblemsMaster,
  setup: ProofreadingSetupJson | null | undefined,
): Record<string, number> {
  if (!setup) return {};
  const maxById = new Map(master.rubric.items.map((x) => [x.id, x.max] as const));
  const out: Record<string, number> = {};
  const cm = maxById.get("content");
  if (cm !== undefined) {
    out.content = clampInt(setup.content_max, 0, cm);
  }
  const gm = maxById.get("grammar");
  if (gm !== undefined) {
    out.grammar = clampInt(setup.grammar_max, 0, gm);
  }
  return out;
}

/**
 * 優先順: 提出に保存済み → 課題・添削設定（サーバー保存）→ 修正入力で前回保存した課題別既定 → 0
 */
export function buildRubricScoresForEditor(
  master: TaskProblemsMaster,
  opts: {
    submissionScores?: Record<string, number> | null | undefined;
    /** 課題・添削設定から算出した既定付け点（taskId で紐づく） */
    teacherSetupScoreDefaults?: Record<string, number> | null | undefined;
    taskDefaults?: Record<string, number> | null | undefined;
  },
): Record<string, number> {
  const sub = opts.submissionScores;
  const teacher = opts.teacherSetupScoreDefaults ?? {};
  const def = opts.taskDefaults ?? {};
  const out: Record<string, number> = {};
  for (const it of master.rubric.items) {
    if (sub && Object.prototype.hasOwnProperty.call(sub, it.id)) {
      const raw = sub[it.id];
      const n = typeof raw === "number" ? raw : Number(raw);
      const v = Number.isFinite(n) ? n : 0;
      out[it.id] = Math.min(Math.max(v, 0), it.max);
      continue;
    }
    let raw: unknown;
    if (Object.prototype.hasOwnProperty.call(teacher, it.id)) {
      raw = teacher[it.id];
    } else if (Object.prototype.hasOwnProperty.call(def, it.id)) {
      raw = def[it.id];
    } else {
      raw = 0;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    const v = Number.isFinite(n) ? n : 0;
    out[it.id] = Math.min(Math.max(v, 0), it.max);
  }
  return out;
}
