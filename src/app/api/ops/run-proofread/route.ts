import { NextResponse } from "next/server";

import {
  allProofreadTargetsAreSelfSubmitted,
  assertTeacherHasTicketsForProofread,
} from "@/lib/billing/proofread-ticket-firestore";
import { resolveEffectiveAnthropicApiKey } from "@/lib/anthropic-key-store";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { classifyProofreadBatchFailure } from "@/lib/proofread-batch-error-code";
import { estimateProofreadTicketCost, listSubmissionsForProofreadTicketScope } from "@/lib/proofread-ticket-cost";
import { runProofreadBatch } from "@/lib/run-proofread-batch";
import { getSubmissions, syncSubmissionsDiskMirrorToFirestore, syncSubmissionsFileMirrorFromFirestore } from "@/lib/submissions-store";
import { syncTaskProblemsFileMirrorFromFirestore } from "@/lib/task-problems-firestore";

/** 1 件でも Gemini が遅いと 5 分を超えることがある。exec の TIMEOUT_MS（14 分）に近づける。 */
export const maxDuration = 900;
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  workers?: number;
  limit?: number;
  retryFailed?: boolean;
  submissionIds?: unknown;
  submissionId?: string;
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
  const submissionIds = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
    : (body.submissionId ?? "").trim()
      ? [String(body.submissionId).trim()]
      : [];

  const submissions = await getSubmissions(auth.organizationId);

  if (submissionIds.length > 0) {
    const allowed = new Set(submissions.map((s) => String(s.submissionId ?? "").trim()));
    const bad = submissionIds.filter((id) => !allowed.has(id));
    if (bad.length > 0) {
      return NextResponse.json(
        { ok: false, message: "指定された受付IDの一部が、この組織の提出に含まれません。" },
        { status: 403 },
      );
    }
  }

  const taskId = String(body.taskId ?? "");
  const limit =
    body.limit === undefined || body.limit === null || Number.isNaN(Number(body.limit))
      ? 0
      : Math.min(500, Math.max(0, Math.floor(Number(body.limit))));

  const scope = {
    submissions,
    taskId,
    submissionIds: submissionIds.length ? submissionIds : undefined,
    retryFailed: Boolean(body.retryFailed),
    limit,
  };

  const targetRowCount = estimateProofreadTicketCost(scope);
  const targetRows = listSubmissionsForProofreadTicketScope(scope);

  if (targetRowCount <= 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_PROOFREAD_TARGETS",
        message:
          "この条件で添削対象となる提出がありません（pending / 指定ID / retryFailed を確認してください）。",
      },
      { status: 422 },
    );
  }

  /** ローカル試験用。true 時は教員チケット検査もスキップ */
  const skipTicketGate = (process.env.NWB_SKIP_PROOFREAD_TICKET_GATE ?? "").trim() === "true";
  /** 教員が自分のアカウントで `/submit` した答案のみを対象にする試行（チケット検査不要・消費なし） */
  const teacherSelfServiceProofread = allProofreadTargetsAreSelfSubmitted(targetRows, auth.uid);
  if (!skipTicketGate && !teacherSelfServiceProofread) {
    const canStart = await assertTeacherHasTicketsForProofread(auth.uid, targetRowCount);
    if (!canStart.ok) {
      return NextResponse.json(
        { ok: false, code: canStart.code, message: canStart.message },
        { status: canStart.code === "INSUFFICIENT_TEACHER_TICKETS" ? 402 : 422 },
      );
    }
  }

  const anthropic = (resolveEffectiveAnthropicApiKey() ?? "").trim();
  if (!anthropic) {
    return NextResponse.json(
      {
        ok: false,
        code: "NEXT_WRITING_BATCH_KEY_MISSING",
        message:
          "Claude API キーがありません。このサーバー（Cloud Run）の環境変数 NEXT_WRITING_BATCH_KEY に Secret を紐付けているか確認してください（ローカルなら data/anthropic_api_key.txt または .env.local の NEXT_WRITING_BATCH_KEY）。",
      },
      { status: 503 },
    );
  }

  // Day3 バッチはローカル submissions.json / task-problems/*.json を読むため、実行直前に Firestore 正から同期する。
  await syncSubmissionsFileMirrorFromFirestore(auth.organizationId);
  await syncTaskProblemsFileMirrorFromFirestore(auth.organizationId);

  const result = await runProofreadBatch({
    organizationId: auth.organizationId,
    taskId: String(body.taskId ?? ""),
    workers: body.workers,
    limit: body.limit,
    retryFailed: Boolean(body.retryFailed),
    submissionIds: submissionIds.length ? submissionIds : undefined,
  });

  if (!result.ok) {
    const stderr = result.stderr ?? "";
    const failureCode = classifyProofreadBatchFailure(stderr, result.error ?? "");
    return NextResponse.json(
      {
        ok: false,
        code: failureCode,
        message: result.error,
        stdout: result.stdout ?? "",
        stderr,
      },
      { status: 500 },
    );
  }

  await syncSubmissionsDiskMirrorToFirestore(auth.organizationId);

  const message = teacherSelfServiceProofread
    ? "添削バッチが完了しました（教員本人名義の試行のためチケット検査を省略しました）。一覧を再読み込みしてください。"
    : "添削バッチが完了しました。一覧を再読み込みしてください。チケットは Day4 確定時に教員プールから 1 件あたり 1 枚消費されます。";

  return NextResponse.json({
    ok: true,
    message,
    teacherSelfServiceProofread,
    targetRows: targetRowCount,
    ticketsDeducted: 0,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
