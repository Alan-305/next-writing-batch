import { NextResponse } from "next/server";

import { assignUserOrganizationId } from "@/lib/org-tenant-lifecycle";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  targetUid?: unknown;
  organizationId?: unknown;
};

/** 管理者: ユーザーの organizationId を変更し、旧テナントが空なら削除 */
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

  const targetUid = body.targetUid != null ? String(body.targetUid).trim() : "";
  const organizationId = body.organizationId != null ? String(body.organizationId).trim() : "";

  if (!targetUid) {
    return NextResponse.json({ ok: false, message: "targetUid が必要です。" }, { status: 400 });
  }
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId が必要です。" }, { status: 400 });
  }

  try {
    const result = await assignUserOrganizationId({ targetUid, organizationId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "更新に失敗しました。" },
      { status: 400 },
    );
  }
}
