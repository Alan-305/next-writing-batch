import { NextResponse } from "next/server";

import { runTicketExpiryReminderJob } from "@/lib/billing/ticket-expiry-notify-server";
import { verifyProofreadWorkerRequest } from "@/lib/proofread/verify-worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!verifyProofreadWorkerRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTicketExpiryReminderJob();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "リマインド送信に失敗しました。" },
      { status: 500 },
    );
  }
}
