import { NextResponse } from "next/server";

import { findLatestSubmissionByStudentLookup } from "@/lib/submissions-store";
import { formatExplanationForPublicView } from "@/lib/student-release";

function outputPublicHref(relativePath: string): string {
  const p = relativePath.replace(/^\/+/, "");
  return p.startsWith("output/") ? `/${p}` : `/${p}`;
}

type LookupBody = {
  taskId?: unknown;
  studentId?: unknown;
  studentName?: unknown;
};

export async function POST(request: Request) {
  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const studentId = typeof body.studentId === "string" ? body.studentId : "";
  const studentName = typeof body.studentName === "string" ? body.studentName : "";

  if (!taskId.trim() || !studentId.trim() || !studentName.trim()) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "課題ID・学籍番号・氏名をすべて入力してください。" },
      { status: 422 },
    );
  }

  const submission = await findLatestSubmissionByStudentLookup({ taskId, studentId, studentName });
  if (!submission) {
    return NextResponse.json({
      ok: true,
      found: false,
      message: "該当する提出が見つかりませんでした。入力内容をご確認ください。",
    });
  }

  const sr = submission.studentRelease;
  const published = Boolean(sr?.operatorApprovedAt);

  if (!published) {
    return NextResponse.json({
      ok: true,
      found: true,
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      phase: "reviewing" as const,
    });
  }

  const pdfPath = submission.day4?.pdf_path?.trim();
  const pdfHref = pdfPath ? outputPublicHref(pdfPath) : "";

  return NextResponse.json({
    ok: true,
    found: true,
    submissionId: submission.submissionId,
    submittedAt: submission.submittedAt,
    phase: "published" as const,
    publishedAt: sr!.operatorApprovedAt,
    resultSummary: {
      scoreTotal: sr!.scoreTotal,
      evaluation: sr!.evaluation,
      generalComment: sr!.generalComment,
      explanation: formatExplanationForPublicView(sr!.explanation ?? ""),
      finalText: sr!.finalText,
    },
    pdfHref: pdfHref || undefined,
  });
}
