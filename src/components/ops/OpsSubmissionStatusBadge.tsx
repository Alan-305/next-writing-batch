"use client";

import { submissionStatusMeta } from "@/lib/ops/submission-status-labels";

type Props = {
  status: string;
  studentViewed?: boolean;
  viewedAt?: string;
  releaseWithdrawn?: boolean;
  /** 一括同期添削中に pending 行を添削中表示 */
  forceProcessing?: boolean;
};

export function OpsSubmissionStatusBadge({
  status,
  studentViewed,
  viewedAt,
  releaseWithdrawn,
  forceProcessing,
}: Props) {
  if (forceProcessing) {
    const meta = submissionStatusMeta("processing");
    return (
      <span className={meta.badgeClass} title="一括添削を実行中">
        <span className="ops-badge__spinner" aria-hidden="true" />
        {meta.label}
      </span>
    );
  }

  const meta = submissionStatusMeta(status, { studentViewed, releaseWithdrawn });
  const title =
    viewedAt && meta.code === "viewed" ? `初回閲覧: ${viewedAt}` : meta.hint;

  return (
    <span className={meta.badgeClass} title={title || undefined}>
      {meta.running ? <span className="ops-badge__spinner" aria-hidden="true" /> : null}
      {meta.label}
    </span>
  );
}
