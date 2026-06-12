import { NextResponse } from "next/server";

import { findSubmissionAcrossOrganizations } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ submissionId: string }> };

/** 公開結果ページのブランディング用（organizationId のみ・機密なし） */
export async function GET(_request: Request, context: RouteContext) {
  const { submissionId: raw } = await context.params;
  const sid = decodeURIComponent(raw ?? "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const hit = await findSubmissionAcrossOrganizations(sid);
  if (!hit) {
    return NextResponse.json({ ok: false, message: "提出が見つかりません。" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    organizationId: hit.organizationId,
  });
}
