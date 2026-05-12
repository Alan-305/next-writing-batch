/**
 * Python 側の stderr / メッセージから、運用者向けの短いコードを推定する。
 */
export function classifyProofreadBatchFailure(stderr: string, message: string): string {
  const bundle = `${stderr}\n${message}`.toLowerCase();
  if (bundle.includes("task_master_missing")) return "TASK_MASTER_MISSING";
  if (bundle.includes("problem_not_in_master")) return "PROBLEM_NOT_IN_MASTER";
  if (
    bundle.includes("missing_env:next_writing_batch_key") ||
    bundle.includes("no api_key or adc")
  )
    return "ANTHROPIC_OR_API_KEY_ISSUE";
  if (bundle.includes("ai_proofread_failed")) return "AI_PROOFREAD_FAILED";
  if (bundle.includes("json_parse_failed")) return "AI_RESPONSE_JSON_PARSE";
  return "PROOFREAD_BATCH_FAILED";
}
