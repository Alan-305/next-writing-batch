import { studentExplanationToDisplayHtml } from "@/lib/explanation-display-html";
import { finalEssayHtmlPlainBlack } from "@/lib/final-essay-diff-html";
import { formatDateTimeIso } from "@/lib/format-date";
import { enrichSubmissionWithResolvedStudentFields } from "@/lib/submission-display-enrich";
import { resolveFinalEssayForStudentDisplay } from "@/lib/student-final-essay-display";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { formatRubricEvaluationInline } from "@/lib/task-problems-core";
import { resolveScoreMaxTotalFromRubric } from "@/lib/celebrations/score-threshold";
import { findSubmissionAcrossOrganizations } from "@/lib/submissions-store";
import { organizationIdFromSubmissionHit } from "@/lib/student-submit-page-path";
import { resolveDay4AudioPlayUrlForSubmission, resolveDay4AudioQrUrlForSubmission } from "@/lib/day4-audio-public-url";

export type StudentResultPublishedModel = {
  submissionId: string;
  studentName: string;
  taskId: string;
  operatorApprovedAtLabel: string;
  explanationHtml: string;
  finalEssayHtml: string;
  scoreInline: string | null;
  scoreTotal: number;
  scoreMaxTotal: number;
  evaluationText: string;
  audioSrc: string;
  audioUrl: string;
  qrSrc: string;
  /** スマホ QR に埋め込む絶対 URL（相対 audioSrc を公開オリジンで解決したもの） */
  audioQrEncodeUrl: string;
};

export type StudentResultPublishedLoadResult =
  | { kind: "missing" }
  | { kind: "unpublished"; submissionId: string; organizationId: string }
  | { kind: "ok"; organizationId: string; model: StudentResultPublishedModel };

export async function loadStudentResultPublishedView(
  submissionId: string,
  options?: { requestOrigin?: string },
): Promise<StudentResultPublishedLoadResult> {
  const sid = (submissionId ?? "").trim();
  if (!sid) return { kind: "missing" };

  const hit = await findSubmissionAcrossOrganizations(sid);
  const raw = hit?.submission ?? null;
  if (!raw) return { kind: "missing" };
  const submission = await enrichSubmissionWithResolvedStudentFields(raw);
  const organizationId = hit
    ? organizationIdFromSubmissionHit(hit.organizationId, submission)
    : organizationIdFromSubmissionHit("", submission);

  const sr = submission.studentRelease;
  if (!sr?.operatorApprovedAt) {
    return { kind: "unpublished", submissionId: submission.submissionId, organizationId };
  }

  const qrPath = submission.day4?.qr_path?.trim() ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";
  const audioUrl = String(submission.day4?.audio_url ?? "").trim();
  const requestOrigin = (options?.requestOrigin ?? "").trim();
  const audioSrc = audioUrl || submission.day4?.audio_path
    ? resolveDay4AudioPlayUrlForSubmission(submission, requestOrigin)
    : "";
  const audioQrEncodeUrl = audioSrc ? resolveDay4AudioQrUrlForSubmission(submission, requestOrigin) : "";

  const explanationHtml = studentExplanationToDisplayHtml(sr.explanation ?? "");
  const { revised: finalRevised } = resolveFinalEssayForStudentDisplay({
    essayText: submission.essayText,
    studentReleaseFinalText: sr.finalText,
    proofread: submission.proofread,
  });
  const finalEssayHtml = finalEssayHtmlPlainBlack(finalRevised);

  const orgForMaster = organizationId;
  const taskMaster = await loadTaskProblemsMaster(orgForMaster, submission.taskId);
  const scoreInline = taskMaster
    ? formatRubricEvaluationInline(taskMaster, sr.scores ?? {}, sr.scoreTotal)
    : null;
  const itemMaxSum = taskMaster
    ? taskMaster.rubric.items.reduce((sum, it) => sum + (it.max > 0 ? it.max : 0), 0)
    : 0;
  const scoreMaxTotal = resolveScoreMaxTotalFromRubric(taskMaster?.rubric.maxTotal, itemMaxSum);

  const model: StudentResultPublishedModel = {
    submissionId: submission.submissionId,
    studentName: submission.studentName,
    taskId: submission.taskId,
    operatorApprovedAtLabel: formatDateTimeIso(sr.operatorApprovedAt),
    explanationHtml,
    finalEssayHtml,
    scoreInline,
    scoreTotal: sr.scoreTotal,
    scoreMaxTotal,
    evaluationText: String(sr.evaluation ?? ""),
    audioSrc,
    audioUrl,
    qrSrc,
    audioQrEncodeUrl,
  };

  return { kind: "ok", organizationId: orgForMaster, model };
}
