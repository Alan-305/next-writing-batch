/**
 * 添削ワークフロー通知メール（提出・預かり・完了/途中経過）の一時停止スイッチ。
 * 送信ロジックは削除せず、ここでのみ有効/無効を切り替える。
 *
 * 復活時: Cloud Run 等に `NWB_PROOFREAD_WORKFLOW_EMAILS=true` を設定する。
 */
export function isProofreadWorkflowEmailEnabled(): boolean {
  const raw = (process.env.NWB_PROOFREAD_WORKFLOW_EMAILS ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function logProofreadWorkflowEmailSkipped(kind: string, detail?: Record<string, unknown>): void {
  console.info("[notify][proofread-workflow-email-disabled] skipped", { kind, ...detail });
}
