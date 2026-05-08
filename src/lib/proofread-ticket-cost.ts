import type { Submission } from "@/lib/submissions-store";

export type ProofreadTicketScopeInput = {
  submissions: Submission[];
  taskId: string;
  submissionIds?: string[];
  retryFailed?: boolean;
  limit: number;
};

/**
 * batch/run_day3_proofread.py の _pick_indices と同じ基準で、添削対象となる提出行を返す。
 * --limit 付きのときは「先頭から最大 N 件」（Python の pending[:limit] と一致）。
 */
export function listSubmissionsForProofreadTicketScope(input: ProofreadTicketScopeInput): Submission[] {
  const taskId = (input.taskId ?? "").trim();
  const submissionIds = input.submissionIds ?? [];
  const idFilter = submissionIds.length > 0 ? new Set(submissionIds.map((x) => x.trim()).filter(Boolean)) : null;
  const retryFailed = Boolean(input.retryFailed);
  const limit = Math.min(500, Math.max(0, Math.floor(Number(input.limit) || 0)));

  const out: Submission[] = [];
  for (const s of input.submissions) {
    const sid = String(s.submissionId ?? "").trim();
    if (idFilter) {
      if (!idFilter.has(sid)) continue;
      if (s.status === "pending" || s.status === "processing" || s.status === "failed" || s.status === "done") {
        out.push(s);
      }
      continue;
    }
    if (taskId && String(s.taskId ?? "") !== taskId) continue;
    if (retryFailed) {
      if (s.status === "failed") out.push(s);
    } else {
      if (s.status === "pending") out.push(s);
    }
  }

  if (limit > 0 && out.length > limit) {
    return out.slice(0, limit);
  }
  return out;
}

/**
 * batch/run_day3_proofread.py の _pick_indices と同じ基準で、消費チケット数（件数）を見積もる。
 * （添削時の減算は行わない。Day4 確定で生徒から 1 枚／提出）
 */
export function estimateProofreadTicketCost(input: ProofreadTicketScopeInput): number {
  return listSubmissionsForProofreadTicketScope(input).length;
}
