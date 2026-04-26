import { NextResponse } from "next/server";

import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { getSubmissionById, updateSubmissionById } from "@/lib/submissions-store";

type RouteContext = { params: Promise<{ submissionId: string }> };

/**
 * 公開済みの添削結果ページが開かれたときに初回だけ記録する（提出一覧の Viewed 表示用）。
 */
export async function POST(_request: Request, context: RouteContext) {
  const { submissionId: raw } = await context.params;
  const submissionId = decodeURIComponent(raw || "").trim();
  if (!submissionId) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const existing = await getSubmissionById(submissionId);
  if (!existing) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }

  if (!existing.studentRelease?.operatorApprovedAt) {
    return NextResponse.json({ ok: false, message: "まだ公開されていません。" }, { status: 403 });
  }

  if (String(existing.studentResultFirstViewedAt ?? "").trim()) {
    return NextResponse.json({ ok: true, already: true });
  }

  const now = new Date().toISOString();
  const updated = await updateSubmissionById(submissionId, (row) => ({
    ...row,
    studentResultFirstViewedAt: now,
  }));

  if (!updated) {
    return NextResponse.json({ ok: false, message: "更新に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, viewedAt: now });
}
