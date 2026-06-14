import type { Submission } from "@/lib/submissions-store";
import { resolveFinalEssayForStudentDisplay } from "@/lib/student-final-essay-display";
import { formatExplanationForPublicView } from "@/lib/student-release";

function outputPublicHref(relativePath: string): string {
  const p = relativePath.replace(/^\/+/, "");
  return p.startsWith("output/") ? `/${p}` : `/${p}`;
}

export function buildSubmissionLookupJson(submission: Submission) {
  const sr = submission.studentRelease;
  const published = Boolean(sr?.operatorApprovedAt);

  if (!published) {
    return {
      ok: true as const,
      found: true as const,
      submissionId: submission.submissionId,
      submittedAt: submission.submittedAt,
      displayNick: submission.studentName,
      phase: "reviewing" as const,
    };
  }

  const pdfPath = submission.day4?.pdf_path?.trim();
  const pdfHref = pdfPath ? outputPublicHref(pdfPath) : "";

  const { revised: finalTextForSummary } = resolveFinalEssayForStudentDisplay({
    essayText: submission.essayText,
    studentReleaseFinalText: sr!.finalText,
    proofread: submission.proofread,
  });

  return {
    ok: true as const,
    found: true as const,
    submissionId: submission.submissionId,
    submittedAt: submission.submittedAt,
    displayNick: submission.studentName,
    phase: "published" as const,
    publishedAt: sr!.operatorApprovedAt,
    resultSummary: {
      scoreTotal: sr!.scoreTotal,
      evaluation: sr!.evaluation,
      explanation: formatExplanationForPublicView(sr!.explanation ?? ""),
      finalText: finalTextForSummary,
    },
    pdfHref: pdfHref || undefined,
    studentReceiveMethod: submission.studentReceiveMethod,
    studentReceiveMethodAt: submission.studentReceiveMethodAt,
  };
}
