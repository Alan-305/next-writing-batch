import { studentExplanationToDisplayHtml } from "@/lib/explanation-display-html";
import { finalEssayHtmlPlainBlack } from "@/lib/final-essay-diff-html";
import { formatDateTimeIso } from "@/lib/format-date";
import { resolveFinalEssayForStudentDisplay } from "@/lib/student-final-essay-display";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { formatRubricEvaluationInline } from "@/lib/task-problems-core";
import { findSubmissionAcrossOrganizations } from "@/lib/submissions-store";

export type StudentResultPublishedModel = {
  submissionId: string;
  studentName: string;
  taskId: string;
  operatorApprovedAtLabel: string;
  explanationHtml: string;
  finalEssayHtml: string;
  scoreInline: string | null;
  scoreTotal: number;
  evaluationText: string;
  audioSrc: string;
  audioUrl: string;
  qrSrc: string;
};

export type StudentResultPublishedLoadResult =
  | { kind: "missing" }
  | { kind: "unpublished"; submissionId: string }
  | { kind: "ok"; organizationId: string; model: StudentResultPublishedModel };

function hrefForAudioUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
  return `/${u.replace(/^\/+/, "")}`;
}

/** 公開済み添削結果（/result）用データ。 */
export async function loadStudentResultPublishedView(
  submissionId: string,
): Promise<StudentResultPublishedLoadResult> {
  const sid = (submissionId ?? "").trim();
  if (!sid) return { kind: "missing" };

  const hit = await findSubmissionAcrossOrganizations(sid);
  const submission = hit?.submission ?? null;
  if (!submission) return { kind: "missing" };

  const sr = submission.studentRelease;
  if (!sr?.operatorApprovedAt) {
    return { kind: "unpublished", submissionId: submission.submissionId };
  }

  const qrPath = submission.day4?.qr_path?.trim() ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";
  const audioUrl = String(submission.day4?.audio_url ?? "").trim();
  const audioSrc = audioUrl ? hrefForAudioUrl(audioUrl) : "";

  const explanationHtml = studentExplanationToDisplayHtml(sr.explanation ?? "");
  const { revised: finalRevised } = resolveFinalEssayForStudentDisplay({
    essayText: submission.essayText,
    studentReleaseFinalText: sr.finalText,
    proofread: submission.proofread,
  });
  const finalEssayHtml = finalEssayHtmlPlainBlack(finalRevised);

  const orgForMaster = hit?.organizationId ?? "";
  const taskMaster = await loadTaskProblemsMaster(orgForMaster, submission.taskId);
  const scoreInline = taskMaster
    ? formatRubricEvaluationInline(taskMaster, sr.scores ?? {}, sr.scoreTotal)
    : null;

  const model: StudentResultPublishedModel = {
    submissionId: submission.submissionId,
    studentName: submission.studentName,
    taskId: submission.taskId,
    operatorApprovedAtLabel: formatDateTimeIso(sr.operatorApprovedAt),
    explanationHtml,
    finalEssayHtml,
    scoreInline,
    scoreTotal: sr.scoreTotal,
    evaluationText: String(sr.evaluation ?? ""),
    audioSrc,
    audioUrl,
    qrSrc,
  };

  return { kind: "ok", organizationId: orgForMaster, model };
}
