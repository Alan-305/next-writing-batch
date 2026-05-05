import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { findSubmissionForTenant } from "@/lib/submission-tenant-assert";
import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { deleteSubmissionByIdInOrganization } from "@/lib/submissions-store";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const { submissionId: raw } = await context.params;
  const submissionId = decodeURIComponent(raw || "").trim();
  if (!submissionId) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const hit = await findSubmissionForTenant(submissionId, auth.organizationId);
  if (!hit) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }

  const ok = await deleteSubmissionByIdInOrganization(hit.organizationId, submissionId);
  if (!ok) {
    return NextResponse.json({ ok: false, message: "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "削除しました。" });
}
