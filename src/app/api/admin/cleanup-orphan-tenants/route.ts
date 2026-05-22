import { NextResponse } from "next/server";

import { cleanupOrphanTenants } from "@/lib/org-tenant-lifecycle";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 孤立テナント（users に紐づかない organizations / data/orgs）を一括削除 */
export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  try {
    const result = await cleanupOrphanTenants();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cleanup-orphan-tenants]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
}
