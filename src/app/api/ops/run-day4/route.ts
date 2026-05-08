import { NextResponse } from "next/server";

import { consumeProofreadTickets, getTicketBalanceForUid } from "@/lib/billing/proofread-ticket-firestore";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import {
  getSubmissionByIdInOrganization,
  getSubmissions,
  syncSubmissionsDiskMirrorToFirestore,
  syncSubmissionsFileMirrorFromFirestore,
  updateSubmissionByIdInOrganization,
} from "@/lib/submissions-store";
import { runDay4Batch } from "@/lib/run-day4-batch";
import { syncTaskProblemsFileMirrorFromFirestore } from "@/lib/task-problems-firestore";

/** Day4 は TTS / PDF 生成で時間がかかることがある（batch 側タイムアウトに合わせ長め） */
export const maxDuration = 900;
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  workers?: number;
  force?: boolean;
  submissionIds?: unknown;
  submissionId?: string;
  /**
   * 運用「確定（Day4 生成）」フローからのみ true。
   * 成功後、その提出の提出者 UID から 1 枚消費（未消費分のみ）。
   */
  chargeStudentTicket?: boolean;
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

  const chargeStudentTicket = Boolean(body.chargeStudentTicket);

  try {
  if (submissionIds.length > 0) {
    const allowed = new Set(
      (await getSubmissions(auth.organizationId)).map((s) => String(s.submissionId ?? "").trim()),
    );
    if (submissionIds.some((id) => !allowed.has(id))) {
      return NextResponse.json(
        { ok: false, message: "指定された受付IDの一部が、この組織の提出に含まれません。" },
        { status: 403 },
      );
    }
  }

  if (chargeStudentTicket && submissionIds.length > 0) {
    for (const sid of submissionIds) {
      const row = await getSubmissionByIdInOrganization(auth.organizationId, sid);
      if (!row) {
        return NextResponse.json({ ok: false, message: "提出が見つかりません。" }, { status: 404 });
      }
      if (String(row.day4TicketChargedAt ?? "").trim()) continue;
      const uid = String(row.submittedByUid ?? "").trim();
      if (!uid) {
        return NextResponse.json(
          {
            ok: false,
            code: "SUBMITTER_UID_REQUIRED",
            message: "ログイン提出でない受付にはチケットを紐付けられません。",
          },
          { status: 422 },
        );
      }
      const bal = await getTicketBalanceForUid(uid);
      if (bal < 1) {
        return NextResponse.json(
          {
            ok: false,
            code: "INSUFFICIENT_STUDENT_TICKETS",
            message: `Day4 確定に必要な生徒のチケットが不足しています（残り ${bal}）。先に教員からチケットを配布してください。`,
            balance: bal,
          },
          { status: 402 },
        );
      }
    }
  }

  // Day4 バッチもローカル submissions / task-problems を読むため、実行直前に Firestore 正から同期する。
  await syncSubmissionsFileMirrorFromFirestore(auth.organizationId);
  await syncTaskProblemsFileMirrorFromFirestore(auth.organizationId);

  const result = await runDay4Batch({
    organizationId: auth.organizationId,
    taskId: String(body.taskId ?? ""),
    workers: body.workers,
    force: Boolean(body.force),
    submissionIds: submissionIds.length ? submissionIds : undefined,
  });

  // Day4 が失敗終了でも、バッチが submissions.json に書いた error/operator_message を画面へ反映させる。
  // （ここを飛ばすと「成果物（Day4）」が古いままになり、運用で原因が見えづらい）
  let syncWarning: string | undefined;
  try {
    await syncSubmissionsDiskMirrorToFirestore(auth.organizationId);
  } catch (syncErr) {
    console.error("[run-day4] syncSubmissionsDiskMirrorToFirestore failed", syncErr);
    syncWarning = "Day4 実行後の Firestore 同期に失敗しました。画面反映が遅れる可能性があります。";
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.error,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        syncWarning,
      },
      { status: 500 },
    );
  }

  let ticketChargeWarning: string | undefined;
  const ticketsCharged: Array<{ submissionId: string; uid: string; remainingAfter: number }> = [];

  if (chargeStudentTicket && submissionIds.length > 0) {
    for (const sid of submissionIds) {
      const row = await getSubmissionByIdInOrganization(auth.organizationId, sid);
      if (!row) continue;
      if (String(row.day4TicketChargedAt ?? "").trim()) continue;

      const uid = String(row.submittedByUid ?? "").trim();
      if (!uid) {
        ticketChargeWarning =
          (ticketChargeWarning ? `${ticketChargeWarning} ` : "") +
          `${sid}: 提出者 UID が無くチケットを消費できませんでした。`;
        continue;
      }

      const consumed = await consumeProofreadTickets(uid, 1, "day4_finalize");
      if (!consumed.ok) {
        ticketChargeWarning =
          (ticketChargeWarning ? `${ticketChargeWarning} ` : "") +
          `${sid}: チケット減算に失敗しました（${consumed.code}）。Day4 は生成済みです。billing を確認してください。`;
        continue;
      }

      const iso = new Date().toISOString();
      await updateSubmissionByIdInOrganization(auth.organizationId, sid, (cur) => ({
        ...cur,
        day4TicketChargedAt: iso,
      }));
      ticketsCharged.push({ submissionId: sid, uid, remainingAfter: consumed.tickets });
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Day4 バッチが完了しました。画面を再読み込みしてください。",
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    syncWarning,
    ticketChargeWarning,
    day4TicketsCharged: ticketsCharged,
  });
  } catch (e) {
    console.error("[run-day4]", e);
    const msg = e instanceof Error ? e.message : "Day4 処理中にサーバーエラーが発生しました。";
    return NextResponse.json({ ok: false, message: msg }, { status: 500 });
  }
}
