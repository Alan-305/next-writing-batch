import type { Submission } from "@/lib/submissions-store";

/** 提出の課題IDと、添削実行時に記録された課題IDが食い違うとき true（再添削前の注意表示用） */
export function submissionProofreadTaskMismatch(submission: Submission): {
  mismatched: boolean;
  sourceTaskId?: string;
} {
  const pr = submission.proofread;
  if (!pr || pr.error) {
    return { mismatched: false };
  }
  const src = String(pr.sourceTaskId ?? "").trim();
  if (!src) {
    return { mismatched: false };
  }
  const hasDone =
    Boolean(String(pr.finishedAt ?? "").trim()) || Boolean(String(pr.generated_at ?? "").trim());
  if (!hasDone) {
    return { mismatched: false };
  }
  const tid = String(submission.taskId ?? "").trim();
  if (!tid || tid === src) {
    return { mismatched: false };
  }
  return { mismatched: true, sourceTaskId: src };
}
