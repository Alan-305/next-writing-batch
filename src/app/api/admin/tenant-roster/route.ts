import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";
import { buildTenantRoster } from "@/lib/admin/tenant-roster";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  try {
    const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
    const roster = await buildTenantRoster(organizationId);
    return NextResponse.json({
      ok: true,
      organizationId: roster.organizationId,
      teachers: roster.teachers,
      students: roster.students,
      teacherCount: roster.teachers.length,
      studentCount: roster.students.length,
      note: roster.note,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "取得に失敗しました。" },
      { status: 500 },
    );
  }
}
