import { NextResponse } from "next/server";

import { postTeacherInquiryToAppsScript, sendTensakuKakumeiContactEmail } from "@/lib/nexus-support";

export const runtime = "nodejs";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 10_000;

function basicEmailOk(s: string): boolean {
  const t = s.trim();
  if (t.length > MAX_EMAIL || !t.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

type Body = {
  name?: unknown;
  email?: unknown;
  message?: unknown;
  /** 空のままにしておく（ボット対策） */
  company?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const honeypot = typeof body.company === "string" ? body.company.trim() : "";
  if (honeypot) {
    return NextResponse.json({ ok: true, message: "送信しました。" });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || !email || !message) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "氏名・メール・お問い合わせ内容をすべて入力してください。" },
      { status: 422 },
    );
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "氏名が長すぎます。" },
      { status: 422 },
    );
  }
  if (!basicEmailOk(email)) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "メールアドレスの形式をご確認ください。" },
      { status: 422 },
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: `お問い合わせ内容は ${MAX_MESSAGE} 文字以内にしてください。` },
      { status: 422 },
    );
  }

  const [mailOk, gasOk] = await Promise.all([
    sendTensakuKakumeiContactEmail({ name, email, message }),
    postTeacherInquiryToAppsScript({ name, email, message, channel: "tensaku_top" }),
  ]);

  if (mailOk && gasOk) {
    return NextResponse.json({ ok: true, mailOk: true, gasOk: true, message: "送信しました。担当より折り返しご連絡いたします。" });
  }
  if (mailOk && !gasOk) {
    return NextResponse.json({
      ok: true,
      partial: true,
      mailOk: true,
      gasOk: false,
      message: "お問い合わせを受け付けました（スプレッドシート記録のみ失敗）。必要に応じて再送してください。",
    });
  }
  if (!mailOk && gasOk) {
    return NextResponse.json({
      ok: true,
      partial: true,
      mailOk: false,
      gasOk: true,
      message:
        "お問い合わせは記録しました（メール通知のみ失敗）。しばらくしてから再度お試しください。",
    });
  }
  if (!mailOk) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "送信に失敗しました。メール送信の設定（RESEND_API_KEY 等）をご確認ください。しばらくしてから再度お試しください。",
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "送信に失敗しました。しばらくしてから再度お試しください。",
    },
    { status: 502 },
  );
}
