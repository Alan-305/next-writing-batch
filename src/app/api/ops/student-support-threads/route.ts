import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { resolveOrganizationIdForTenantUid } from "@/lib/auth/resolve-effective-organization";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  getStudentSupportThreadById,
  listStudentSupportMessages,
  listStudentSupportThreadsForOrg,
  setStudentSupportThreadHidden,
} from "@/lib/student-support-thread";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PatchBody = { threadId?: unknown; hidden?: unknown };

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

/** 教員: 問い合わせを一覧から非表示 / 再表示（メッセージは削除しない） */
export async function PATCH(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const organizationId = await resolveOrganizationIdForTenantUid(auth.uid);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "テナントが見つかりません。" }, { status: 404 });
  }

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const threadId = String(body.threadId ?? "").trim();
  if (!threadId) {
    return NextResponse.json({ ok: false, message: "threadId が必要です。" }, { status: 400 });
  }

  const hidden = body.hidden === true;

  const thread = await getStudentSupportThreadById(organizationId, threadId);
  if (!thread) {
    return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
  }

  const updated = await setStudentSupportThreadHidden(organizationId, threadId, hidden);
  if (!updated) {
    return NextResponse.json({ ok: false, message: "更新に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: hidden ? "問い合わせを一覧から非表示にしました（生徒のメッセージは残ります）。" : "問い合わせを一覧に再表示しました。",
  });
}
