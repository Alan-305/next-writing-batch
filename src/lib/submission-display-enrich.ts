import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import type { Submission } from "@/lib/submissions-store";

/**
 * 運用表示用: submittedByUid がある提出は users から学籍・表示名を解決し、
 * studentId / studentName 相当のフィールドを埋めたコピーを返す（永続データは変更しない）。
 */
export async function enrichSubmissionsWithResolvedStudentFields(
  rows: Submission[],
): Promise<Submission[]> {
  const uids = [
    ...new Set(rows.map((r) => String(r.submittedByUid ?? "").trim()).filter(Boolean)),
  ];
  if (uids.length === 0) return rows;

  const db = getAdminFirestore();
  const snaps = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
  const uidTo = new Map<string, { studentNumber: string; nickname: string }>();
  for (const doc of snaps) {
    if (!doc.exists) continue;
    uidTo.set(doc.id, {
      studentNumber: String(doc.get("studentNumber") ?? "").trim(),
      nickname: String(doc.get("nickname") ?? "").trim(),
    });
  }

  return rows.map((s) => {
    const uid = String(s.submittedByUid ?? "").trim();
    if (!uid) return s;
    const legacyId = String(s.studentId ?? "").trim();
    const legacyName = String(s.studentName ?? "").trim();
    if (legacyId || legacyName) return s;
    const p = uidTo.get(uid);
    if (!p) return s;
    return {
      ...s,
      studentId: p.studentNumber || "",
      studentName: p.nickname || "",
    };
  });
}

export async function enrichSubmissionWithResolvedStudentFields(
  submission: Submission,
): Promise<Submission> {
  const [next] = await enrichSubmissionsWithResolvedStudentFields([submission]);
  return next ?? submission;
}
