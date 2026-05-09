import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import {
  findLatestSubmissionByStudentLookup,
  findLatestSubmissionByUidAndTask,
} from "@/lib/submissions-store";
import { resolveFinalEssayForStudentDisplay } from "@/lib/student-final-essay-display";
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
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const studentId = typeof body.studentId === "string" ? body.studentId : "";
  const studentName = typeof body.studentName === "string" ? body.studentName : "";

  if (!taskId.trim()) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "課題を選択してください。" },
      { status: 422 },
    );
  }

  const hasId = Boolean(studentId.trim());
  const hasName = Boolean(studentName.trim());
  if (hasId !== hasName) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message:
          "学籍番号と氏名は両方入力するか、どちらも空にしてください（空のときはログイン中のアカウントで照会します）。",
      },
      { status: 422 },
    );
  }

  const legacy = hasId && hasName;
  const submission = legacy
    ? await findLatestSubmissionByStudentLookup(auth.organizationId, {
        taskId,
        studentId,
        studentName,
      })
    : await findLatestSubmissionByUidAndTask(auth.organizationId, auth.uid, taskId);
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

  const { revised: finalTextForSummary } = resolveFinalEssayForStudentDisplay({
    essayText: submission.essayText,
    studentReleaseFinalText: sr!.finalText,
    proofread: submission.proofread,
  });

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
      explanation: formatExplanationForPublicView(sr!.explanation ?? ""),
      finalText: finalTextForSummary,
    },
    pdfHref: pdfHref || undefined,
  });
}
