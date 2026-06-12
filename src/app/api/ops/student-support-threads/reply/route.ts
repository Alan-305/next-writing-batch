import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { resolveOrganizationIdForTenantUid } from "@/lib/auth/resolve-effective-organization";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { normalizeRedeemLookupToken } from "@/lib/anonymous-redeem";
import {
  appendStudentSupportMessage,
  listStudentSupportThreadsForOrg,
  studentSupportThreadId,
} from "@/lib/student-support-thread";

export const runtime = "nodejs";

const MAX_REPLY = 10_000;

type Body = {
  threadId?: unknown;
  displayNick?: unknown;
  redeemId?: unknown;
  content?: unknown;
};

/** 教員: 生徒サポートへの返信 */
export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const organizationId = await resolveOrganizationIdForTenantUid(auth.uid);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "テナントが見つかりません。" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const threadIdRaw = String(body.threadId ?? "").trim();
  const displayNick = normalizeRedeemLookupToken(String(body.displayNick ?? ""));
  const redeemId = normalizeRedeemLookupToken(String(body.redeemId ?? ""));

  if (!content) {
    return NextResponse.json({ ok: false, message: "返信内容を入力してください。" }, { status: 422 });
  }
  if (content.length > MAX_REPLY) {
    return NextResponse.json(
      { ok: false, message: `返信内容は ${MAX_REPLY} 文字以内にしてください。` },
      { status: 422 },
    );
  }

  let displayNickResolved = displayNick;
  let redeemIdResolved = redeemId;

  if (threadIdRaw) {
    const threads = await listStudentSupportThreadsForOrg(organizationId);
    const thread = threads.find((t) => t.threadId === threadIdRaw);
    if (!thread) {
      return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
    }
    displayNickResolved = thread.displayNick;
    redeemIdResolved = thread.redeemId;
  } else if (!displayNickResolved || !redeemIdResolved) {
    return NextResponse.json({ ok: false, message: "threadId またはニックネーム＋引換IDが必要です。" }, { status: 422 });
  }

  const expectedThreadId = studentSupportThreadId(displayNickResolved, redeemIdResolved);
  if (threadIdRaw && threadIdRaw !== expectedThreadId) {
    return NextResponse.json({ ok: false, message: "スレッドが見つかりません。" }, { status: 404 });
  }

  await appendStudentSupportMessage({
    organizationId,
    displayNick: displayNickResolved,
    redeemId: redeemIdResolved,
    role: "teacher",
    content,
  });

  return NextResponse.json({ ok: true, message: "返信を送信しました。生徒のメッセージボックスに表示されます。" });
}
