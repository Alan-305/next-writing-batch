import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { describeOrganizationIdForUid } from "@/lib/firebase/admin-firestore";
import { listOrganizationIdsOnDisk } from "@/lib/org-data-layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tenantDevSelfAssignAllowed(): boolean {
  return process.env.TENANT_DEV_SELF_ASSIGN === "true";
}

/**
 * ログイン中ユーザーが API で解決されるテナント ID と、Firestore 上の生の値を返す（検証用）。
 */
export async function GET(_request: Request) {
  const auth = await verifyBearerUid(_request);
  if (!auth.ok) return auth.response;

  try {
    const resolution = await describeOrganizationIdForUid(auth.uid);
    const orgsOnDisk = await listOrganizationIdsOnDisk();
    return NextResponse.json({
      ok: true,
      ...resolution,
      orgsOnDisk: orgsOnDisk.sort(),
      tenantDevSelfAssignAllowed: tenantDevSelfAssignAllowed(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}
