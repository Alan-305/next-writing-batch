import { NextResponse } from "next/server";

import { getAdminPublishedPdfResponse } from "@/lib/admin/tenant-published-pdfs";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ submissionId: string }> };

/**
 * 教員向け: 集計レポートから公開済み PDF を閲覧（閲覧済みフラグは更新しない）。
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const { submissionId: raw } = await context.params;
  const submissionId = decodeURIComponent(raw || "").trim();
  if (!submissionId) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  try {
    return await getAdminPublishedPdfResponse(auth.organizationId, submissionId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "PDF の取得に失敗しました。" },
      { status: 500 },
    );
  }
}
