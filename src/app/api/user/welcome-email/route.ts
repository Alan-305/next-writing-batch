import { NextResponse } from "next/server";

import { sendWelcomeEmailIfNeeded } from "@/lib/auth/welcome-email-server";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ログイン済み本人のウェルカムメール送信（未送信時のみ・冪等） */
export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await sendWelcomeEmailIfNeeded(auth.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[api/user/welcome-email]", e);
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "ウェルカムメールの送信に失敗しました。",
      },
      { status: 500 },
    );
  }
}
