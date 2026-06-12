import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  getAdminActingOrganizationIdFromRequest,
  resolveOrganizationIdForTenantUid,
} from "@/lib/auth/resolve-effective-organization";
import { describeOrganizationIdForUid } from "@/lib/firebase/admin-firestore";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
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

  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  try {
    const resolution = await describeOrganizationIdForUid(auth.uid);
    const effectiveOrganizationId = await resolveOrganizationIdForTenantUid(auth.uid);
    const adminActingOrganizationId =
      isAllowlistedAdminUid(auth.uid) ? getAdminActingOrganizationIdFromRequest(_request) : null;
    const orgsOnDisk = await listOrganizationIdsOnDisk();
    return NextResponse.json({
      ok: true,
      ...resolution,
      effectiveOrganizationId,
      adminActingOrganizationId,
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
