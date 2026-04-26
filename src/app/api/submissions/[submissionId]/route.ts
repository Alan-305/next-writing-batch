import { NextResponse } from "next/server";

import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { deleteSubmissionById, getSubmissionById } from "@/lib/submissions-store";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { submissionId: raw } = await context.params;
  const submissionId = decodeURIComponent(raw || "").trim();
  if (!submissionId) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const existing = await getSubmissionById(submissionId);
  if (!existing) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }

  const ok = await deleteSubmissionById(submissionId);
  if (!ok) {
    return NextResponse.json({ ok: false, message: "削除に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "削除しました。" });
}
