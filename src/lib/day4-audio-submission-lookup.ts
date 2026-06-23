import { day4AudioBasename, day4AudioMp3Filename } from "@/lib/day4-audio-basename";
import { parseDay4AudioPathSegments } from "@/lib/day4-audio-gcs-objects";
import {
  findSubmissionAcrossOrganizations,
  type Submission,
  type SubmissionWithOrganization,
} from "@/lib/submissions-store";
import { defaultOrganizationId } from "@/lib/organization-id";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

function submissionMatchesDay4Audio(
  submission: Submission,
  taskId: string,
  mp3Filename: string,
): boolean {
  const tid = taskId.trim();
  const fn = mp3Filename.trim();
  if ((submission.taskId ?? "").trim() !== tid) return false;

  const idFromFn = fn.replace(/\.mp3$/i, "");
  if ((submission.submissionId ?? "").trim() === idFromFn) return true;
  if ((submission.studentId ?? "").trim() === idFromFn) return true;
  if ((submission.submittedByUid ?? "").trim() === idFromFn) return true;
  if (day4AudioBasename(submission) === idFromFn) return true;
  if (day4AudioMp3Filename(submission) === fn) return true;

  const d4 = submission.day4;
  if (!d4) return false;
  const path = String(d4.audio_path ?? "").trim();
  if (path.endsWith(`/${fn}`) || path.endsWith(fn)) return true;
  const parsed = parseDay4AudioPathSegments(path);
  if (parsed && parsed.taskId === tid && parsed.filename === fn) return true;

  const url = String(d4.audio_url ?? "").trim();
  return url.includes(fn) || url.includes(idFromFn);
}

/** `/api/day4-audio/{taskId}/{file}.mp3` に対応する提出を探す（保持期限判定用） */
export async function findSubmissionForDay4Audio(
  taskId: string,
  mp3Filename: string,
): Promise<SubmissionWithOrganization | null> {
  const tid = taskId.trim();
  const fn = mp3Filename.trim();
  if (!tid || !fn) return null;

  const idFromFn = fn.replace(/\.mp3$/i, "");
  const byId = await findSubmissionAcrossOrganizations(idFromFn);
  if (byId && submissionMatchesDay4Audio(byId.submission, tid, fn)) return byId;

  try {
    const snap = await getAdminFirestore()
      .collectionGroup("submissions")
      .where("taskId", "==", tid)
      .limit(40)
      .get();

    for (const doc of snap.docs) {
      const submission = doc.data() as Submission;
      if (!submissionMatchesDay4Audio(submission, tid, fn)) continue;
      const organizationId = doc.ref.parent.parent?.id ?? defaultOrganizationId();
      return { submission, organizationId };
    }
  } catch (e) {
    console.error("[day4-audio] findSubmissionForDay4Audio collectionGroup failed", { taskId: tid, fn, e });
  }

  return null;
}
