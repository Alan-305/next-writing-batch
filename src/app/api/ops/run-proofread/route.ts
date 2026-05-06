import { NextResponse } from "next/server";

import {
  consumeProofreadTickets,
  getTicketBalanceForUid,
} from "@/lib/billing/proofread-ticket-firestore";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { estimateProofreadTicketCost } from "@/lib/proofread-ticket-cost";
import { runProofreadBatch } from "@/lib/run-proofread-batch";
import { getSubmissions } from "@/lib/submissions-store";

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

  const ticketCost = estimateProofreadTicketCost({
    submissions,
    taskId,
    submissionIds: submissionIds.length ? submissionIds : undefined,
    retryFailed: Boolean(body.retryFailed),
    limit,
  });

  if (ticketCost <= 0) {
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

  const skipTicketGate = (process.env.NWB_SKIP_PROOFREAD_TICKET_GATE ?? "").trim() === "true";
  if (!skipTicketGate) {
    const balance = await getTicketBalanceForUid(auth.uid);
    if (balance < ticketCost) {
      return NextResponse.json(
        {
          ok: false,
          code: "INSUFFICIENT_TICKETS",
          message: `チケットが不足しています（必要: ${ticketCost} / 残り: ${balance}）。購入または管理者による調整が必要です。`,
          requiredTickets: ticketCost,
          balance,
        },
        { status: 402 },
      );
    }
  }

  const result = await runProofreadBatch({
    organizationId: auth.organizationId,
    taskId: String(body.taskId ?? ""),
    workers: body.workers,
    limit: body.limit,
    retryFailed: Boolean(body.retryFailed),
    submissionIds: submissionIds.length ? submissionIds : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.error,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      },
      { status: 500 },
    );
  }

  let ticketsAfter: number | undefined;
  let ticketWarning: string | undefined;
  if (!skipTicketGate) {
    const consumed = await consumeProofreadTickets(auth.uid, ticketCost);
    if (!consumed.ok) {
      ticketWarning =
        consumed.code === "INSUFFICIENT"
          ? "添削は完了しましたが、チケット減算時に残高不足が検出されました（同時実行など）。管理者に billing を確認してください。"
          : "添削は完了しましたがユーザードキュメントが見つかり、チケットを減算できませんでした。";
      console.error("[run-proofread] ticket consume failed after successful batch", {
        uid: auth.uid,
        ticketCost,
        code: consumed.code,
      });
    } else {
      ticketsAfter = consumed.tickets;
    }
  }

  return NextResponse.json({
    ok: true,
    message: "添削バッチが完了しました。一覧を再読み込みしてください。",
    durationMs: result.durationMs,
    ticketsConsumed: skipTicketGate ? 0 : ticketCost,
    ticketsRemaining: ticketsAfter,
    ticketWarning,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
