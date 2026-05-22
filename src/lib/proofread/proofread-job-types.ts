export type ProofreadJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type ProofreadJob = {
  jobId: string;
  organizationId: string;
  submissionId: string;
  taskId: string;
  requestedByUid: string;
  /** 同一 enqueue 操作でまとめたバッチ（通知用） */
  batchId?: string;
  status: ProofreadJobStatus;
  forceRedo: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  attempt: number;
  lastError?: string;
  /** Cloud Tasks の task name（中止時に delete する） */
  cloudTaskName?: string;
};

/** 預け型のまとまり（完了・途中経過メール用） */
export type ProofreadBatch = {
  batchId: string;
  organizationId: string;
  requestedByUid: string;
  createdAt: string;
  jobIds: string[];
  totalJobs: number;
  lastProgressEmailAt?: string;
  completionEmailSentAt?: string;
};

export type EnqueueProofreadInput = {
  organizationId: string;
  requestedByUid: string;
  submissionIds: string[];
  /** done の提出を再添削キューに入れる */
  forceRedo?: boolean;
};

export type EnqueueProofreadResult =
  | {
      ok: true;
      batchId: string;
      enqueued: Array<{ submissionId: string; jobId: string }>;
      skipped: Array<{ submissionId: string; reason: string }>;
    }
  | { ok: false; code: string; message: string };

export type ProcessProofreadJobInput = {
  organizationId: string;
  submissionId: string;
  jobId: string;
};

export type ProcessProofreadJobResult =
  | { ok: true; submissionStatus: string }
  | { ok: false; code: string; message: string };

export type CancelProofreadInput = {
  organizationId: string;
  submissionId: string;
  requestedByUid: string;
};

export type CancelProofreadResult =
  | { ok: true; submissionStatus: string }
  | { ok: false; code: string; message: string };

/** キュー投入可能な提出 status（processing はタイムアウト回収後のみ） */
export const PROOFREAD_ENQUEUEABLE_STATUSES = new Set([
  "pending",
  "failed",
  "queued",
  "processing",
  "done",
]);

export const PROOFREAD_STALE_PROCESSING_MS = 20 * 60 * 1000;
/** この時間を超えて queued のままなら失敗扱いに戻す（Cloud Tasks 失敗の取り残し） */
export const PROOFREAD_STALE_QUEUED_MS = 3 * 60 * 1000;

export function isStaleQueuedRow(row: { status: string; proofreadQueuedAt?: string }): boolean {
  if (row.status !== "queued") return false;
  const raw = (row.proofreadQueuedAt ?? "").trim();
  if (!raw) return true;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > PROOFREAD_STALE_QUEUED_MS;
}
