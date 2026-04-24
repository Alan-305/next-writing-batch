/** Nexus Learning 教員向け「添削代行」と同じ保存形式（`tpwSettingsPayload`） */

export type ProofreadingSetupJson = {
  schema_version: 1;
  /**
   * 生徒提出の taskId・data/task-problems/{taskId}.json・batch --task-id と揃えるための ID。
   * Nexus 本体の tpwSettings には無い拡張フィールド（任意）。
   */
  task_id: string;
  /** 運用メモ（提出フォームの problemMemo に相当。添削プロンプトの question には使わない） */
  problem_memo: string;
  teacher_name: string;
  teacher_email: string;
  school_name: string;
  grammar_max: number;
  content_max: number;
  question: string;
};

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 未設定・欠損キーを埋め、制御コンポーネント用に常に完全な形へ */
export function sanitizeProofreadingSetup(raw: unknown): ProofreadingSetupJson {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let grammar_max = 25;
  let content_max = 25;
  if (typeof o.grammar_max === "number") grammar_max = o.grammar_max;
  if (typeof o.content_max === "number") content_max = o.content_max;
  if (typeof o.grammar_max === "string") grammar_max = parseInt(o.grammar_max, 10) || 25;
  if (typeof o.content_max === "string") content_max = parseInt(o.content_max, 10) || 25;
  return {
    schema_version: 1,
    task_id: typeof o.task_id === "string" ? o.task_id : "",
    problem_memo: typeof o.problem_memo === "string" ? o.problem_memo : "",
    teacher_name: typeof o.teacher_name === "string" ? o.teacher_name : "",
    teacher_email: typeof o.teacher_email === "string" ? o.teacher_email : "",
    school_name: typeof o.school_name === "string" ? o.school_name : "",
    grammar_max: clampInt(grammar_max, 1, 100),
    content_max: clampInt(content_max, 1, 100),
    question: typeof o.question === "string" ? o.question : "",
  };
}

export function isProofreadingSetupJson(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.schema_version === 1) return true;
  if (
    typeof o.question === "string" &&
    (
      ["grammar_max", "content_max", "teacher_name", "school_name", "task_id", "problem_memo"] as const
    ).some((k) => k in o)
  ) {
    return true;
  }
  return false;
}

export function parseProofreadingSetupJson(raw: unknown): ProofreadingSetupJson | null {
  if (!raw || typeof raw !== "object") return null;
  return sanitizeProofreadingSetup(raw);
}

/** 教員設定 JSON から、提出フォームの「課題文」用に question だけ取り出す */
export function extractQuestionFromTeacherJson(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.question !== "string") return null;
  const q = o.question.trim();
  return q || null;
}
