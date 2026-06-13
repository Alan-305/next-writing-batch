import { NextResponse } from "next/server";

import { resolvePrimaryTeacherEmailForOrganization } from "@/lib/admin/tenant-roster";
import { normalizeRedeemLookupToken } from "@/lib/anonymous-redeem";
import { buildAnonymousSupportEmailBody, resolveOpsStudentSupportSignInUrl, sendStudentSupportInquiryEmail } from "@/lib/nexus-support";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import {
  appendStudentSupportMessage,
  listStudentSupportMessages,
} from "@/lib/student-support-thread";
import { findSubmissionByRedeemLookup } from "@/lib/submissions-store";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

export const runtime = "nodejs";

const MAX_INQUIRY = 10_000;

type PostBody = {
  organizationId?: unknown;
  displayNick?: unknown;
  redeemId?: unknown;
  content?: unknown;
  taskId?: unknown;
};

async function verifyStudentPair(
  organizationId: string,
  displayNick: string,
  redeemId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const submission = await findSubmissionByRedeemLookup(organizationId, { displayNick, redeemId });
  if (!submission) {
    return {
      ok: false,
      message: "ニックネームと引換IDの組み合わせが見つかりません。提出時に表示された情報を確認してください。",
    };
  }
  return { ok: true };
}

/** 匿名生徒: サポートメッセージ一覧 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = sanitizeOrganizationIdForPath(String(url.searchParams.get("organizationId") ?? "").trim());
  const displayNick = normalizeRedeemLookupToken(String(url.searchParams.get("displayNick") ?? ""));
  const redeemId = normalizeRedeemLookupToken(String(url.searchParams.get("redeemId") ?? ""));

  if (!organizationId || !displayNick || !redeemId) {
    return NextResponse.json(
      { ok: false, message: "organizationId、displayNick、redeemId が必要です。" },
      { status: 400 },
    );
  }

  const verified = await verifyStudentPair(organizationId, displayNick, redeemId);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, message: verified.message }, { status: 404 });
  }

  const messages = await listStudentSupportMessages(organizationId, displayNick, redeemId);
  return NextResponse.json({ ok: true, messages });
}

/** 匿名生徒: サポート問い合わせ送信 */
export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const organizationId = sanitizeOrganizationIdForPath(String(body.organizationId ?? "").trim());
  const displayNick = normalizeRedeemLookupToken(String(body.displayNick ?? ""));
  const redeemId = normalizeRedeemLookupToken(String(body.redeemId ?? ""));
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";

  if (!organizationId || !displayNick || !redeemId || !content) {
    return NextResponse.json(
      { ok: false, message: "ニックネーム、引換ID、お問い合わせ内容を入力してください。" },
      { status: 422 },
    );
  }
  if (content.length > MAX_INQUIRY) {
    return NextResponse.json(
      { ok: false, message: `お問い合わせ内容は ${MAX_INQUIRY} 文字以内にしてください。` },
      { status: 422 },
    );
  }
  if (taskId) {
    const tidErr = validateTaskIdForStorage(taskId);
    if (tidErr) {
      return NextResponse.json({ ok: false, message: tidErr }, { status: 422 });
    }
  }

  const verified = await verifyStudentPair(organizationId, displayNick, redeemId);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, message: verified.message }, { status: 404 });
  }

  await appendStudentSupportMessage({
    organizationId,
    displayNick,
    redeemId,
    role: "student",
    content,
    taskId: taskId || undefined,
  });

  const teacherEmail = await resolvePrimaryTeacherEmailForOrganization(organizationId);
  if (teacherEmail) {
    const requestOrigin = new URL(request.url).origin;
    const mailBody = buildAnonymousSupportEmailBody({
      organizationId,
      displayNick,
      redeemId,
      taskId: taskId || undefined,
      inquiry: content,
      opsStudentSupportUrl: resolveOpsStudentSupportSignInUrl(requestOrigin),
    });
    void sendStudentSupportInquiryEmail({
      teacherEmail,
      studentName: displayNick,
      replyToEmail: "",
      body: mailBody,
    }).catch((e) => console.error("[support/anonymous][email]", e));
  }

  return NextResponse.json({
    ok: true,
    message: "送信しました。担当の先生に届きます。返信はこのメッセージボックスに表示されます。",
  });
}
