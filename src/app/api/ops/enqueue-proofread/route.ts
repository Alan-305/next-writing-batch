import { NextResponse } from "next/server";

import {
  allProofreadTargetsAreSelfSubmitted,
  assertTeacherHasTicketsForProofread,
} from "@/lib/billing/proofread-ticket-firestore";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import {
  PROOFREAD_MAX_ENQUEUE_BATCH,
  resolveProofreadBatchLimit,
} from "@/lib/proofread/proofread-job-types";
import { enqueueProofreadJobs } from "@/lib/proofread/proofread-job";
import { notifyProofreadEnqueueReceipt } from "@/lib/notifications/teacher-notify";
import { estimateProofreadTicketCost, listSubmissionsForProofreadTicketScope } from "@/lib/proofread-ticket-cost";
import { getSubmissions } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";

type Body = {
  submissionIds?: unknown;
  submissionId?: string;
  taskId?: string;
  /** pending を taskId で絞って最大 limit 件キュー投入 */
  queuePendingForTaskId?: boolean;
  limit?: number;
  forceRedo?: boolean;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const rawIds = body.submissionIds;
  let submissionIds = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
    : (body.submissionId ?? "").trim()
      ? [String(body.submissionId).trim()]
      : [];

  const taskId = String(body.taskId ?? "").trim();
  const queuePending = Boolean(body.queuePendingForTaskId);
  const limitRaw = body.limit;
  const limitExplicit =
    limitRaw !== undefined && limitRaw !== null && !Number.isNaN(Number(limitRaw))
      ? Math.floor(Number(limitRaw))
      : null;
  if (limitExplicit !== null && limitExplicit > PROOFREAD_MAX_ENQUEUE_BATCH) {
    return NextResponse.json(
      {
        ok: false,
        code: "BATCH_LIMIT_EXCEEDED",
        message: `1回に預けられるのは最大 ${PROOFREAD_MAX_ENQUEUE_BATCH} 件です。${PROOFREAD_MAX_ENQUEUE_BATCH} 件以下に分けて実行してください。`,
      },
      { status: 422 },
    );
  }
  const limit = resolveProofreadBatchLimit(limitRaw);

  if (queuePending) {
    if (!taskId) {
      return NextResponse.json({ ok: false, message: "taskId が必要です。" }, { status: 400 });
    }
    const submissions = await getSubmissions(auth.organizationId);
    const pending = submissions.filter(
      (s) => s.status === "pending" && String(s.taskId ?? "").trim() === taskId,
    );
    submissionIds = pending.slice(0, limit).map((s) => s.submissionId);
  }

  if (submissionIds.length > PROOFREAD_MAX_ENQUEUE_BATCH) {
    return NextResponse.json(
      {
        ok: false,
        code: "BATCH_LIMIT_EXCEEDED",
        message: `1回に預けられるのは最大 ${PROOFREAD_MAX_ENQUEUE_BATCH} 件です（指定 ${submissionIds.length} 件）。分けて実行してください。`,
      },
      { status: 422 },
    );
  }

  if (submissionIds.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_SUBMISSIONS",
        message: "submissionId / submissionIds を指定するか、queuePendingForTaskId で pending を選んでください。",
      },
      { status: 422 },
    );
  }

  const submissions = await getSubmissions(auth.organizationId);
  const allowed = new Set(submissions.map((s) => String(s.submissionId ?? "").trim()));
  const bad = submissionIds.filter((id) => !allowed.has(id));
  if (bad.length > 0) {
    return NextResponse.json(
      { ok: false, message: "指定された受付IDの一部が、この組織の提出に含まれません。" },
      { status: 403 },
    );
  }

  const targetRows = submissions.filter((s) => submissionIds.includes(s.submissionId));
  const targetRowCount = estimateProofreadTicketCost({
    submissions,
    taskId,
    submissionIds,
    retryFailed: false,
    limit: 0,
  });

  const skipTicketGate = (process.env.NWB_SKIP_PROOFREAD_TICKET_GATE ?? "").trim() === "true";
  const teacherSelfServiceProofread = allProofreadTargetsAreSelfSubmitted(targetRows, auth.uid);
  if (!skipTicketGate && !teacherSelfServiceProofread && !Boolean(body.forceRedo)) {
    const canStart = await assertTeacherHasTicketsForProofread(auth.uid, targetRowCount);
    if (!canStart.ok) {
      return NextResponse.json(
        { ok: false, code: canStart.code, message: canStart.message },
        { status: canStart.code === "INSUFFICIENT_TEACHER_TICKETS" ? 402 : 422 },
      );
    }
  }

  const result = await enqueueProofreadJobs({
    organizationId: auth.organizationId,
    requestedByUid: auth.uid,
    submissionIds,
    forceRedo: Boolean(body.forceRedo),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.code === "NOTHING_ENQUEUED" ? 422 : 503 },
    );
  }

  void notifyProofreadEnqueueReceipt({
    requestedByUid: auth.uid,
    enqueuedCount: result.enqueued.length,
    batchId: result.batchId,
  }).catch((e) => console.error("[enqueue-proofread][receipt-notify]", e));

  return NextResponse.json(
    {
      ok: true,
      message:
        `${result.enqueued.length} 件を添削キューに預けました。空き時間に処理されます。全件完了時にメールでお知らせします（約1時間ごとに途中経過も送ります）。一覧で queued → processing → done を確認できます。`,
      batchId: result.batchId,
      enqueued: result.enqueued,
      skipped: result.skipped,
      teacherSelfServiceProofread,
    },
    { status: 202 },
  );
}
