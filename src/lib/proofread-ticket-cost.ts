import type { Submission } from "@/lib/submissions-store";

/**
 * batch/run_day3_proofread.py の _pick_indices と同じ基準で、消費チケット数（件数）を見積もる。
 */
export function estimateProofreadTicketCost(input: {
  submissions: Submission[];
  taskId: string;
  submissionIds?: string[];
  retryFailed?: boolean;
  limit: number;
}): number {
  const taskId = (input.taskId ?? "").trim();
  const submissionIds = input.submissionIds ?? [];
  const idFilter = submissionIds.length > 0 ? new Set(submissionIds.map((x) => x.trim()).filter(Boolean)) : null;
  const retryFailed = Boolean(input.retryFailed);
  const limit = Math.min(500, Math.max(0, Math.floor(Number(input.limit) || 0)));

  let n = 0;
  for (const s of input.submissions) {
    const sid = String(s.submissionId ?? "").trim();
    if (idFilter) {
      if (!idFilter.has(sid)) continue;
      if (s.status === "pending" || s.status === "processing" || s.status === "failed" || s.status === "done") {
        n++;
      }
      continue;
    }
    if (taskId && String(s.taskId ?? "") !== taskId) continue;
    if (retryFailed) {
      if (s.status === "failed") n++;
    } else {
      if (s.status === "pending") n++;
    }
  }

  if (limit > 0) {
    n = Math.min(n, limit);
  }
  return n;
}
