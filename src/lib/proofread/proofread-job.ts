import { randomUUID } from "crypto";

import { resolveEffectiveAnthropicApiKey } from "@/lib/anthropic-key-store";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import {
  deleteProofreadCloudTask,
  dispatchProofreadCloudTask,
  isCloudTasksProofreadConfigured,
  shouldProcessProofreadInline,
} from "@/lib/proofread/cloud-tasks-enqueue";
import type {
  CancelProofreadInput,
  CancelProofreadResult,
  EnqueueProofreadInput,
  EnqueueProofreadResult,
  ProcessProofreadJobInput,
  ProcessProofreadJobResult,
  ProofreadBatch,
  ProofreadJob,
} from "@/lib/proofread/proofread-job-types";
import { PROOFREAD_STALE_PROCESSING_MS, isStaleQueuedRow } from "@/lib/proofread/proofread-job-types";
import { classifyProofreadBatchFailure } from "@/lib/proofread-batch-error-code";
import { createProofreadBatchDoc, maybeNotifyProofreadBatch } from "@/lib/proofread/proofread-batch-notify";
import { runProofreadBatch } from "@/lib/run-proofread-batch";
import { mergeProofreadIntoWithdrawnStudentRelease } from "@/lib/student-release";
import {
  getSubmissionByIdInOrganization,
  syncSubmissionsDiskMirrorToFirestore,
  syncSubmissionsFileMirrorFromFirestore,
  updateSubmissionByIdInOrganization,
  type Submission,
} from "@/lib/submissions-store";
import { syncTaskProblemsFileMirrorFromFirestore } from "@/lib/task-problems-firestore";

function orgProofreadJobsCol(organizationId: string) {
  return getAdminFirestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("proofreadJobs");
}

function submissionRef(organizationId: string, submissionId: string) {
  return getAdminFirestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("submissions")
    .doc(submissionId);
}

function isStaleProcessing(row: Submission): boolean {
  if (row.status !== "processing") return false;
  const started =
    (row.proofread?.startedAt ?? "").trim() ||
    (row as Submission & { processingStartedAt?: string }).processingStartedAt?.trim() ||
    "";
  if (!started) return true;
  const t = Date.parse(started);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > PROOFREAD_STALE_PROCESSING_MS;
}

function canEnqueueSubmission(row: Submission, forceRedo: boolean): { ok: true } | { ok: false; reason: string } {
  const st = row.status;
  if (st === "pending" || st === "failed") return { ok: true };
  if (st === "queued") {
    if (isStaleQueuedRow(row)) return { ok: true };
    return { ok: false, reason: "QUEUED_IN_PROGRESS" };
  }
  if (st === "processing") {
    if (isStaleProcessing(row)) return { ok: true };
    return { ok: false, reason: "PROCESSING_IN_PROGRESS" };
  }
  if (st === "done") {
    if (forceRedo) return { ok: true };
    return { ok: false, reason: "ALREADY_DONE" };
  }
  return { ok: false, reason: `STATUS_${st}` };
}

async function markSubmissionQueued(
  organizationId: string,
  submissionId: string,
  jobId: string,
  requestedByUid: string,
): Promise<Submission | null> {
  const ref = submissionRef(organizationId, submissionId);
  const db = getAdminFirestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data() as Submission;
    const next: Submission = {
      ...current,
      status: "queued",
      organizationId,
      proofreadJobId: jobId,
      proofreadQueuedAt: new Date().toISOString(),
      proofreadQueuedByUid: requestedByUid,
    };
    tx.set(ref, next, { merge: false });
    return next;
  });
}

async function createProofreadJobDoc(job: ProofreadJob): Promise<void> {
  await orgProofreadJobsCol(job.organizationId).doc(job.jobId).set(job);
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

async function updateProofreadJobDoc(
  organizationId: string,
  jobId: string,
  patch: Partial<ProofreadJob>,
): Promise<void> {
  await orgProofreadJobsCol(organizationId).doc(jobId).set(omitUndefined(patch), { merge: true });
}

async function isProofreadJobCancelled(organizationId: string, jobId: string): Promise<boolean> {
  const snap = await orgProofreadJobsCol(organizationId).doc(jobId).get();
  if (!snap.exists) return false;
  return (snap.data() as ProofreadJob).status === "cancelled";
}

const CANCEL_OPERATOR_MESSAGE =
  "添削を中止しました。必要なら「添削」からもう一度始められます。";

async function applyProofreadCancellationToSubmission(
  organizationId: string,
  submissionId: string,
  wasProcessing: boolean,
): Promise<string> {
  const finishedAt = new Date().toISOString();
  const nextStatus = wasProcessing ? "failed" : "pending";
  await updateSubmissionByIdInOrganization(organizationId, submissionId, (s) => {
    const next: Submission = {
      ...s,
      status: nextStatus,
      proofread: {
        ...(s.proofread ?? {}),
        operator_message: CANCEL_OPERATOR_MESSAGE,
        finishedAt,
      },
    };
    delete (next as Submission & { proofreadJobId?: string }).proofreadJobId;
    delete (next as Submission & { proofreadQueuedAt?: string }).proofreadQueuedAt;
    delete (next as Submission & { proofreadQueuedByUid?: string }).proofreadQueuedByUid;
    return next;
  });
  return nextStatus;
}

/** Firestore は undefined を許容しない。旧 error フィールドは明示的に FieldValue.delete 相当で除去する。 */
function proofreadPatchForProcessing(prev: Submission["proofread"], startedAt: string): NonNullable<Submission["proofread"]> {
  const base = { ...(prev ?? {}) };
  delete base.error;
  delete base.operator_message;
  return { ...base, startedAt };
}

async function failProofreadJobAndSubmission(
  organizationId: string,
  submissionId: string,
  jobId: string,
  error: string,
  operatorMessage: string,
  batchId?: string,
): Promise<void> {
  const finishedAt = new Date().toISOString();
  await updateProofreadJobDoc(organizationId, jobId, {
    status: "failed",
    finishedAt,
    lastError: error,
  }).catch((e) => console.error("[proofread] job doc fail update", e));
  await updateSubmissionByIdInOrganization(organizationId, submissionId, (s) => {
    const base = { ...(s.proofread ?? {}) };
    return {
      ...s,
      status: "failed",
      proofread: {
        ...base,
        error,
        operator_message: operatorMessage,
        finishedAt,
      },
    };
  }).catch((e) => console.error("[proofread] submission fail update", e));
  fireBatchNotify(organizationId, batchId);
}

async function dispatchJob(payload: {
  organizationId: string;
  submissionId: string;
  jobId: string;
}): Promise<string | null> {
  if (isCloudTasksProofreadConfigured()) {
    return await dispatchProofreadCloudTask(payload);
  }
  if (shouldProcessProofreadInline()) {
    fireProofreadInlineJob(payload);
    return null;
  }
  throw new Error("PROOFREAD_DISPATCH_NOT_CONFIGURED");
}

function fireBatchNotify(organizationId: string, batchId: string | undefined): void {
  const bid = (batchId ?? "").trim();
  if (!bid) return;
  void maybeNotifyProofreadBatch(organizationId, bid).catch((e) => {
    console.error("[proofread][batch-notify-failed]", { organizationId, batchId: bid, e });
  });
}

export async function enqueueProofreadJobs(input: EnqueueProofreadInput): Promise<EnqueueProofreadResult> {
  const organizationId = (input.organizationId ?? "").trim();
  const requestedByUid = (input.requestedByUid ?? "").trim();
  const forceRedo = Boolean(input.forceRedo);
  const ids = [...new Set((input.submissionIds ?? []).map((x) => String(x ?? "").trim()).filter(Boolean))];

  if (!organizationId || !requestedByUid) {
    return { ok: false, code: "VALIDATION_ERROR", message: "organizationId と requestedByUid が必要です。" };
  }
  if (ids.length === 0) {
    return { ok: false, code: "NO_SUBMISSIONS", message: "submissionIds が空です。" };
  }

  if (!isCloudTasksProofreadConfigured() && !shouldProcessProofreadInline()) {
    return {
      ok: false,
      code: "PROOFREAD_DISPATCH_NOT_CONFIGURED",
      message:
        "添削キューが未設定です。本番では Cloud Tasks（NWB_CLOUD_TASKS_* / NWB_PROOFREAD_WORKER_URL）を設定してください。ローカルでは NWB_PROOFREAD_INLINE=true と NWB_PROOFREAD_WORKER_SECRET を .env.local に設定してください。",
    };
  }

  const anthropic = (resolveEffectiveAnthropicApiKey() ?? "").trim();
  if (!anthropic) {
    return {
      ok: false,
      code: "NEXT_WRITING_BATCH_KEY_MISSING",
      message: "Claude API キー（NEXT_WRITING_BATCH_KEY）がありません。",
    };
  }

  const enqueued: Array<{ submissionId: string; jobId: string }> = [];
  const skipped: Array<{ submissionId: string; reason: string }> = [];
  const batchId = randomUUID();
  const batchCreatedAt = new Date().toISOString();
  const batchJobIds: string[] = [];

  for (const submissionId of ids) {
    const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
    if (!row) {
      skipped.push({ submissionId, reason: "NOT_FOUND" });
      continue;
    }
    const gate = canEnqueueSubmission(row, forceRedo);
    if (!gate.ok) {
      skipped.push({ submissionId, reason: gate.reason });
      continue;
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    const job: ProofreadJob = {
      jobId,
      organizationId,
      submissionId,
      taskId: String(row.taskId ?? "").trim(),
      requestedByUid,
      batchId,
      status: "queued",
      forceRedo,
      createdAt: now,
      attempt: 0,
    };

    try {
      await markSubmissionQueued(organizationId, submissionId, jobId, requestedByUid);
      await createProofreadJobDoc(job);
      batchJobIds.push(jobId);
      const cloudTaskName = await dispatchJob({ organizationId, submissionId, jobId });
      if (cloudTaskName) {
        await updateProofreadJobDoc(organizationId, jobId, { cloudTaskName });
      }
      enqueued.push({ submissionId, jobId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({ submissionId, reason: msg.slice(0, 200) });
      await updateProofreadJobDoc(organizationId, jobId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        lastError: msg,
      }).catch(() => undefined);
    }
  }

  if (enqueued.length === 0) {
    return {
      ok: false,
      code: "NOTHING_ENQUEUED",
      message: "キューに入れられた提出がありません。",
    };
  }

  const batch: ProofreadBatch = {
    batchId,
    organizationId,
    requestedByUid,
    createdAt: batchCreatedAt,
    jobIds: batchJobIds,
    totalJobs: batchJobIds.length,
  };
  await createProofreadBatchDoc(batch);

  return { ok: true, batchId, enqueued, skipped };
}

export async function cancelProofreadJob(input: CancelProofreadInput): Promise<CancelProofreadResult> {
  const organizationId = (input.organizationId ?? "").trim();
  const submissionId = (input.submissionId ?? "").trim();
  const requestedByUid = (input.requestedByUid ?? "").trim();

  if (!organizationId || !submissionId || !requestedByUid) {
    return { ok: false, code: "VALIDATION_ERROR", message: "organizationId, submissionId, requestedByUid が必要です。" };
  }

  const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "提出が見つかりません。" };
  }

  if (row.status !== "queued" && row.status !== "processing") {
    return {
      ok: false,
      code: "NOT_CANCELLABLE",
      message: "キュー待ちまたは添削中の提出だけ中止できます。",
    };
  }

  const jobId = String(row.proofreadJobId ?? "").trim();
  const wasProcessing = row.status === "processing";

  if (jobId) {
    const jobSnap = await orgProofreadJobsCol(organizationId).doc(jobId).get();
    const job = jobSnap.exists ? (jobSnap.data() as ProofreadJob) : null;

    if (job?.status === "cancelled") {
      const submissionStatus = await applyProofreadCancellationToSubmission(
        organizationId,
        submissionId,
        wasProcessing,
      );
      return { ok: true, submissionStatus };
    }

    if (job?.cloudTaskName) {
      await deleteProofreadCloudTask(job.cloudTaskName).catch((e) => {
        console.warn("[proofread][cancel] cloud task delete failed", job.cloudTaskName, e);
      });
    }

    if (job) {
      await updateProofreadJobDoc(organizationId, jobId, {
        status: "cancelled",
        finishedAt: new Date().toISOString(),
        lastError: "cancelled_by_user",
      });
      fireBatchNotify(organizationId, job.batchId);
    }
  }

  const submissionStatus = await applyProofreadCancellationToSubmission(
    organizationId,
    submissionId,
    wasProcessing,
  );
  return { ok: true, submissionStatus };
}

export async function processProofreadJob(input: ProcessProofreadJobInput): Promise<ProcessProofreadJobResult> {
  const organizationId = (input.organizationId ?? "").trim();
  const submissionId = (input.submissionId ?? "").trim();
  const jobId = (input.jobId ?? "").trim();

  if (!organizationId || !submissionId || !jobId) {
    return { ok: false, code: "VALIDATION_ERROR", message: "organizationId, submissionId, jobId が必要です。" };
  }

  const jobSnap = await orgProofreadJobsCol(organizationId).doc(jobId).get();
  if (!jobSnap.exists) {
    return { ok: false, code: "JOB_NOT_FOUND", message: "ジョブが見つかりません。" };
  }
  const job = jobSnap.data() as ProofreadJob;
  if (job.submissionId !== submissionId) {
    return { ok: false, code: "JOB_MISMATCH", message: "ジョブと submissionId が一致しません。" };
  }
  if (job.status === "cancelled") {
    const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
    return { ok: true, submissionStatus: row?.status ?? "pending" };
  }
  if (job.status === "succeeded") {
    const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
    return { ok: true, submissionStatus: row?.status ?? "done" };
  }

  const startedAt = new Date().toISOString();
  if (await isProofreadJobCancelled(organizationId, jobId)) {
    const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
    return { ok: true, submissionStatus: row?.status ?? "pending" };
  }

  await updateProofreadJobDoc(organizationId, jobId, {
    status: "running",
    startedAt,
    attempt: (job.attempt ?? 0) + 1,
  });

  const row = await getSubmissionByIdInOrganization(organizationId, submissionId);
  if (!row) {
    await failProofreadJobAndSubmission(
      organizationId,
      submissionId,
      jobId,
      "submission_not_found",
      "提出が見つかりませんでした。",
      job.batchId,
    );
    return { ok: false, code: "SUBMISSION_NOT_FOUND", message: "提出が見つかりません。" };
  }

  const taskId = String(row.taskId ?? "").trim();
  if (!taskId) {
    await failProofreadJobAndSubmission(
      organizationId,
      submissionId,
      jobId,
      "missing_task_id",
      "提出に課題IDがありません。",
      job.batchId,
    );
    return { ok: false, code: "MISSING_TASK_ID", message: "提出に taskId がありません。" };
  }

  try {
    // UI（Firestore 正）に processing を即反映。Python 完了まで queued のままにしない。
    await updateSubmissionByIdInOrganization(organizationId, submissionId, (s) => ({
      ...s,
      status: "processing",
      proofread: proofreadPatchForProcessing(s.proofread, startedAt),
    }));

    await syncSubmissionsFileMirrorFromFirestore(organizationId);
    await syncTaskProblemsFileMirrorFromFirestore(organizationId);

    const result = await runProofreadBatch({
      organizationId,
      taskId,
      submissionIds: [submissionId],
    });

    if (!result.ok) {
      const failureCode = classifyProofreadBatchFailure(result.stderr ?? "", result.error ?? "");
      await syncSubmissionsDiskMirrorToFirestore(organizationId).catch(() => undefined);
      if (await isProofreadJobCancelled(organizationId, jobId)) {
        const rowAfterCancel = await getSubmissionByIdInOrganization(organizationId, submissionId);
        return { ok: true, submissionStatus: rowAfterCancel?.status ?? "pending" };
      }
      const errMsg = result.error ?? failureCode;
      await failProofreadJobAndSubmission(
        organizationId,
        submissionId,
        jobId,
        errMsg,
        "添削処理でエラーが発生しました。しばらく待ってから「添削やり直し」をお試しください。",
        job.batchId,
      );
      return { ok: false, code: failureCode, message: result.error ?? "添削バッチが失敗しました。" };
    }

    if (await isProofreadJobCancelled(organizationId, jobId)) {
      const rowAfterCancel = await getSubmissionByIdInOrganization(organizationId, submissionId);
      return { ok: true, submissionStatus: rowAfterCancel?.status ?? "pending" };
    }

    await syncSubmissionsDiskMirrorToFirestore(organizationId);
    const after = await getSubmissionByIdInOrganization(organizationId, submissionId);
    if (
      after?.proofread?.explanation &&
      String(after.studentRelease?.operatorWithdrawnAt ?? "").trim()
    ) {
      await updateSubmissionByIdInOrganization(organizationId, submissionId, (s) => ({
        ...s,
        studentRelease: mergeProofreadIntoWithdrawnStudentRelease(
          s.studentRelease,
          s.proofread ?? {},
        ),
      }));
    }
    const afterReleaseSync = await getSubmissionByIdInOrganization(organizationId, submissionId);
    const finalStatus = afterReleaseSync?.status ?? after?.status ?? "done";

    const jobFinishPatch: Partial<ProofreadJob> = {
      status: finalStatus === "done" ? "succeeded" : "failed",
      finishedAt: new Date().toISOString(),
    };
    if (finalStatus === "failed" && afterReleaseSync?.proofread?.error) {
      jobFinishPatch.lastError = afterReleaseSync.proofread.error;
    }
    await updateProofreadJobDoc(organizationId, jobId, jobFinishPatch);

    fireBatchNotify(organizationId, job.batchId);

    return { ok: true, submissionStatus: finalStatus };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[proofread][process-job-failed]", { organizationId, submissionId, jobId, msg });
    await syncSubmissionsDiskMirrorToFirestore(organizationId).catch(() => undefined);
    const afterSync = await getSubmissionByIdInOrganization(organizationId, submissionId);
    if (afterSync?.status === "done") {
      // Python 添削は成功済み。ジョブ doc 更新だけ失敗したケースで提出を failed に戻さない。
      await updateProofreadJobDoc(organizationId, jobId, {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
      }).catch((jobErr) => console.error("[proofread] job doc success recovery", jobErr));
      fireBatchNotify(organizationId, job.batchId);
      return { ok: true, submissionStatus: "done" };
    }
    await failProofreadJobAndSubmission(
      organizationId,
      submissionId,
      jobId,
      msg,
      "添削処理でエラーが発生しました。もう一度「添削やり直し」をお試しください。",
      job.batchId,
    );
    return { ok: false, code: "PROOFREAD_PROCESS_FAILED", message: msg };
  }
}

/** enqueue 後にインライン dispatch 用（開発サーバーで fire-and-forget） */
export function fireProofreadInlineJob(payload: {
  organizationId: string;
  submissionId: string;
  jobId: string;
}): void {
  void processProofreadJob(payload).catch((e) => {
    console.error("[proofread][inline-job-failed]", payload, e);
  });
}
