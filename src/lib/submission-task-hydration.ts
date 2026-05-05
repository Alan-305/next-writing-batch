import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { pickQuestion } from "@/lib/task-problems-core";
import type { SubmissionInput } from "@/lib/validation";
import type { ValidationErrors } from "@/lib/validation";

export type HydrateResult =
  | { ok: true; input: SubmissionInput }
  | { ok: false; fields: ValidationErrors; message: string };

/**
 * 提出の taskId が課題マスタに登録されていることを確認し、
 * problemId / question をマスタから補完する（生徒フォームは課題文を送らない前提）。
 */
export async function hydrateSubmissionForRegisteredTask(
  organizationId: string,
  input: SubmissionInput,
): Promise<HydrateResult> {
  const taskId = input.taskId.trim();
  const master = await loadTaskProblemsMaster(organizationId, taskId);
  if (!master) {
    return {
      ok: false,
      fields: { taskId: "登録されていない課題IDです。リストから選ぶか、先生の案内を確認してください。" },
      message: "未登録の課題IDです。",
    };
  }

  const fields: ValidationErrors = {};
  let problemId = (input.problemId ?? "").trim();
  let question = (input.question ?? "").trim();

  if (master.problems.length === 1) {
    const p0 = master.problems[0]!;
    problemId = p0.problemId;
    question = p0.question.trim();
  } else {
    if (!problemId) {
      fields.problemId = "この課題には複数設問があります。設問を選択してください。";
    } else {
      const q = pickQuestion(master, problemId);
      if (!q) {
        fields.problemId = "無効な設問です。設問を選び直してください。";
      } else {
        question = q.trim();
      }
    }
  }

  if (!question) {
    fields.taskId = fields.taskId ?? "課題マスタに問題文がありません。運用に連絡してください。";
  }

  if (Object.keys(fields).length > 0) {
    return { ok: false, fields, message: "課題の解決に失敗しました。" };
  }

  const next: SubmissionInput = {
    ...input,
    taskId,
    problemId,
    question,
  };

  return { ok: true, input: next };
}
