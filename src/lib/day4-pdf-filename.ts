import type { Submission } from "@/lib/submissions-store";

function safeArcSegment(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "unknown";
  return t.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/** batch/day4_pdf_delivery.pdf_filename_for_submission 相当 */
export function pdfFilenameForSubmission(
  submission: Pick<Submission, "taskId" | "studentId" | "studentName" | "submissionId">,
): string {
  const task = safeArcSegment(String(submission.taskId ?? "task"));
  const rawStudentId = String(submission.studentId ?? "").trim();
  const safeStudent = rawStudentId ? safeArcSegment(rawStudentId) : "";
  const name = String(submission.studentName ?? "")
    .trim()
    .replace(/ /g, "_");
  const safeName = name ? safeArcSegment(name) : "";
  const readableName = safeName.replace(/^[_-]+|[_-]+$/g, "");
  const hasAsciiName = /[a-zA-Z]/.test(readableName);

  let stem: string;
  if (safeStudent && hasAsciiName) {
    stem = `${task}_${safeStudent}_${readableName}`;
  } else if (safeStudent) {
    stem = `${task}_${safeStudent}`;
  } else {
    const shortSub = safeArcSegment(String(submission.submissionId ?? "")).slice(0, 8);
    stem = `${task}_${shortSub || "unknown"}`;
  }
  return `${stem.slice(0, 160)}.pdf`;
}

function addGcsObjectCandidate(out: string[], raw: string | null | undefined): void {
  const obj = String(raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!obj || obj.includes("..") || out.includes(obj)) return;
  out.push(obj);
}

/** GCS 上の PDF オブジェクト名候補（古い pdf_path や pdf_gcs_object 欠落にも対応） */
export function pdfGcsObjectCandidates(submission: Submission): string[] {
  const out: string[] = [];
  const d4 = submission.day4;
  const taskId = String(submission.taskId ?? "").trim();
  const safeTask = safeArcSegment(taskId);

  if (d4 && typeof d4 === "object") {
    addGcsObjectCandidate(out, d4.pdf_gcs_object);

    const rel = String(d4.pdf_path ?? "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (rel.startsWith("output/pdf/")) {
      addGcsObjectCandidate(out, rel.slice("output/".length));
    } else if (rel.startsWith("pdf/")) {
      addGcsObjectCandidate(out, rel);
    } else {
      const pdfIdx = rel.indexOf("/pdf/");
      if (pdfIdx >= 0) {
        addGcsObjectCandidate(out, `pdf/${rel.slice(pdfIdx + 5)}`);
      }
      const basename = rel.split("/").filter(Boolean).pop();
      if (basename && safeTask) {
        addGcsObjectCandidate(out, `pdf/${safeTask}/${basename}`);
      }
    }
  }

  if (safeTask) {
    const computed = pdfFilenameForSubmission(submission);
    addGcsObjectCandidate(out, `pdf/${safeTask}/${computed}`);

    const sid = String(submission.submissionId ?? "").trim();
    if (sid) {
      const short = safeArcSegment(sid).slice(0, 8);
      addGcsObjectCandidate(out, `pdf/${safeTask}/${safeTask}_${short}.pdf`);
    }
  }

  return out;
}
