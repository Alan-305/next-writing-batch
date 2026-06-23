import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { resolveOrganizationIdForTenantUid } from "@/lib/auth/resolve-effective-organization";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  deleteStudentSupportThread,
  getStudentSupportThreadById,
  listStudentSupportMessages,
  listStudentSupportThreadsForOrg,
} from "@/lib/student-support-thread";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DeleteBody = { threadId?: unknown };

/** 教員: 生徒サポートスレッド一覧 */
export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const organizationId = await resolveOrganizationIdForTenantUid(auth.uid);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "テナントが見つかりません。" }, { status: 404 });
  }

  const url = new URL(request.url);
  const threadId = String(url.searchParams.get("threadId") ?? "").trim();

  if (threadId) {
    const thread = await getStudentSupportThreadById(organizationId, threadId);
    if (!thread) {
      return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
    }
    const messages = await listStudentSupportMessages(organizationId, thread.displayNick, thread.redeemId);
    return NextResponse.json({ ok: true, thread, messages });
  }

  const threads = await listStudentSupportThreadsForOrg(organizationId);
  return NextResponse.json({ ok: true, threads });
}

/** 教員: 不要になったスレッドを削除 */
export async function DELETE(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const organizationId = await resolveOrganizationIdForTenantUid(auth.uid);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "テナントが見つかりません。" }, { status: 404 });
  }

  let body: DeleteBody = {};
  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const threadId = String(body.threadId ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ ok: false, message: "threadId が必要です。" }, { status: 400 });
  }

  const thread = await getStudentSupportThreadById(organizationId, threadId);
  if (!thread) {
    return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
  }

  const deleted = await deleteStudentSupportThread(organizationId, threadId);
  if (!deleted) {
    return NextResponse.json({ ok: false, message: "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "問い合わせを削除しました。" });
}
