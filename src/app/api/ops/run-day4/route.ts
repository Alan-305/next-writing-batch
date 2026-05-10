import { NextResponse } from "next/server";

import { consumeProofreadTickets, getTicketBalanceForUid } from "@/lib/billing/proofread-ticket-firestore";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
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
   * 成功後、運用教員の billing.tickets から 1 提出あたり 1 枚消費（未請求分のみ）。
   */
  chargeTicket?: boolean;
  /** @deprecated chargeTicket と同じ（後方互換） */
  chargeStudentTicket?: boolean;
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

  const chargeTicket = Boolean(body.chargeTicket ?? body.chargeStudentTicket);

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

  if (chargeTicket && submissionIds.length > 0) {
    let needTickets = 0;
    for (const sid of submissionIds) {
      const row = await getSubmissionByIdInOrganization(auth.organizationId, sid);
      if (!row) {
        return NextResponse.json({ ok: false, message: "提出が見つかりません。" }, { status: 404 });
      }
      if (String(row.day4TicketChargedAt ?? "").trim()) continue;
      if (!String(row.submittedByUid ?? "").trim()) continue;
      needTickets += 1;
    }
    if (needTickets > 0) {
      const teacherBal = await getTicketBalanceForUid(auth.uid);
      if (teacherBal < needTickets) {
        return NextResponse.json(
          {
            ok: false,
            code: "INSUFFICIENT_TEACHER_TICKETS",
            message: `Day4 確定に必要な教員のチケットが不足しています（必要: ${needTickets} 枚 / 残り: ${teacherBal}）。「招待QRとチケット状況」で購入してください。`,
            balance: teacherBal,
            required: needTickets,
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
  const ticketsCharged: Array<{ submissionId: string; chargedFromUid: string; remainingAfter: number }> = [];

  if (chargeTicket && submissionIds.length > 0) {
    const teacherUid = auth.uid;
    for (const sid of submissionIds) {
      const row = await getSubmissionByIdInOrganization(auth.organizationId, sid);
      if (!row) continue;
      if (String(row.day4TicketChargedAt ?? "").trim()) continue;

      const submitterUid = String(row.submittedByUid ?? "").trim();
      if (!submitterUid) {
        ticketChargeWarning =
          (ticketChargeWarning ? `${ticketChargeWarning} ` : "") +
          `${sid}: ログイン提出ではないため請求記録のみスキップしました（教員チケットは消費していません）。`;
        continue;
      }

      const consumed = await consumeProofreadTickets(teacherUid, 1, "day4_finalize");
      if (!consumed.ok) {
        ticketChargeWarning =
          (ticketChargeWarning ? `${ticketChargeWarning} ` : "") +
          `${sid}: 教員チケットの減算に失敗しました（${consumed.code}）。Day4 は生成済みです。billing を確認してください。`;
        continue;
      }

      const iso = new Date().toISOString();
      await updateSubmissionByIdInOrganization(auth.organizationId, sid, (cur) => ({
        ...cur,
        day4TicketChargedAt: iso,
      }));
      ticketsCharged.push({ submissionId: sid, chargedFromUid: teacherUid, remainingAfter: consumed.tickets });
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
