import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { resolveOrganizationIdForTenantUid } from "@/lib/auth/resolve-effective-organization";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  listStudentSupportMessages,
  listStudentSupportThreadsForOrg,
} from "@/lib/student-support-thread";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const threads = await listStudentSupportThreadsForOrg(organizationId);
    const thread = threads.find((t) => t.threadId === threadId);
    if (!thread) {
      return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
    }
    const messages = await listStudentSupportMessages(organizationId, thread.displayNick, thread.redeemId);
    return NextResponse.json({ ok: true, thread, messages });
  }

  const threads = await listStudentSupportThreadsForOrg(organizationId);
  return NextResponse.json({ ok: true, threads });
}
