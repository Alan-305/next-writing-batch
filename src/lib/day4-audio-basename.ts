import type { Submission } from "@/lib/submissions-store";

/** batch/run_day4_tts_qr_pdf._day4_asset_basename 相当 */
export function day4AudioBasename(submission: Pick<Submission, "submissionId" | "studentId" | "submittedByUid">): string {
  const sid = String(submission.submissionId ?? "").trim();
  if (sid) {
    const safe = sid.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    if (safe) return safe;
  }

  const rawId = String(submission.studentId ?? "").trim();
  if (rawId) {
    const safe = rawId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    if (safe) return safe;
  }

  const uid = String(submission.submittedByUid ?? "").trim();
  if (uid) {
    const safe = uid.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 36);
    if (safe) return safe;
  }

  return "submission";
}

export function day4AudioMp3Filename(submission: Pick<Submission, "submissionId" | "studentId" | "submittedByUid">): string {
  return `${day4AudioBasename(submission)}.mp3`;
}
