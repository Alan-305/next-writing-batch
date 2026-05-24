import { NextResponse } from "next/server";

import {
  AdminAdjustBillingTicketsError,
  executeAdminAdjustBillingTickets,
} from "@/lib/billing/admin-adjust-billing-tickets-server";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  targetUserId?: unknown;
  deltaTickets?: unknown;
  reason?: unknown;
  idempotencyKey?: unknown;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  try {
    const result = await executeAdminAdjustBillingTickets(auth.uid, {
      targetUserId: body.targetUserId != null ? String(body.targetUserId) : "",
      deltaTickets: Number(body.deltaTickets),
      reason: typeof body.reason === "string" ? body.reason : undefined,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AdminAdjustBillingTicketsError) {
      const status =
        e.code === "INVALID_ARGUMENT" ? 422 : e.code === "NOT_FOUND" ? 404 : 500;
      return NextResponse.json({ ok: false, message: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "チケット調整に失敗しました。" },
      { status: 500 },
    );
  }
}
