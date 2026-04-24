import { NextResponse } from "next/server";

import {
  buildGasSupportContent,
  buildSupportEmailBody,
  postSupportToAppsScript,
  sendSupportNotificationEmail,
} from "@/lib/nexus-support";

export const runtime = "nodejs";

const MAX_TASK = 200;
const MAX_STUDENT_ID = 80;
const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_INQUIRY = 10_000;

function basicEmailOk(s: string): boolean {
  const t = s.trim();
  if (t.length > MAX_EMAIL || !t.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

type Body = {
  taskId?: unknown;
  studentId?: unknown;
  studentName?: unknown;
  email?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const studentName = typeof body.studentName === "string" ? body.studentName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!taskId || !studentId || !studentName || !email || !content) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "すべての項目を入力してください。" },
      { status: 422 },
    );
  }
  if (taskId.length > MAX_TASK || studentId.length > MAX_STUDENT_ID || studentName.length > MAX_NAME) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "課題ID・学籍番号・氏名の長さを短くしてください。" },
      { status: 422 },
    );
  }
  if (!basicEmailOk(email)) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "メールアドレスの形式をご確認ください。" },
      { status: 422 },
    );
  }
  if (content.length > MAX_INQUIRY) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: `お問い合わせ内容は ${MAX_INQUIRY} 文字以内にしてください。` },
      { status: 422 },
    );
  }

  const gasContent = buildGasSupportContent(taskId, studentId, content);
  const mailBody = buildSupportEmailBody({ taskId, studentId, studentName, email, inquiry: content });

  const [sheetOk, mailOk] = await Promise.all([
    postSupportToAppsScript({ studentName, email, content: gasContent }),
    sendSupportNotificationEmail({ studentName, email, body: mailBody }),
  ]);

  if (sheetOk && mailOk) {
    return NextResponse.json({ ok: true, sheetOk: true, mailOk: true, message: "送信しました。ありがとうございます。" });
  }
  if (sheetOk && !mailOk) {
    return NextResponse.json({
      ok: true,
      partial: true,
      sheetOk: true,
      mailOk: false,
      message:
        "お問い合わせは記録しました。（メール通知のみ失敗しました。事務局までお電話等でご連絡ください。）",
    });
  }
  if (mailOk && !sheetOk) {
    return NextResponse.json({
      ok: true,
      partial: true,
      sheetOk: false,
      mailOk: true,
      message: "事務局へのメールは送信しましたが、スプレッドシートへの記録に失敗しました。お手数ですが再度お試しください。",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      sheetOk: false,
      mailOk: false,
      message: "送信に失敗しました。しばらくしてから再度お試しください。",
    },
    { status: 502 },
  );
}
