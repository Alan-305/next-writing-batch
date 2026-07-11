import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { parseReportFilterSearchParams } from "@/lib/ops/reports/build-report-summary";
import { buildReportWeaknesses } from "@/lib/ops/reports/build-report-weaknesses";
import { listSubmissionsReadOnly } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 教員向け: 文法コメント箇条書きから頻出ミスを集約 */
export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  try {
    const url = new URL(request.url);
    const filters = parseReportFilterSearchParams(url);
    const topRaw = url.searchParams.get("topN");
    const topN = topRaw ? Math.min(500, Math.max(20, Number(topRaw) || 200)) : 200;
    const submissions = await listSubmissionsReadOnly(auth.organizationId);
    const weaknesses = buildReportWeaknesses(submissions, filters, { topN });

    return NextResponse.json({
      ok: true,
      organizationId: auth.organizationId,
      filters,
      weaknesses,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "弱点集計に失敗しました。" },
      { status: 500 },
    );
  }
}
