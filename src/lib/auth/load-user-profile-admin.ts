import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import type { FirestoreUserProfile } from "@/lib/firebase/types";

/** Admin SDK で users/{uid} を読む（API ルート用） */
export async function loadUserProfileAdmin(uid: string): Promise<FirestoreUserProfile | null> {
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  return {
    roles: Array.isArray(d.roles) ? d.roles.filter((r: unknown): r is string => typeof r === "string") : [],
    organizationId:
      d.organizationId === undefined || d.organizationId === null ? null : String(d.organizationId),
    studentNumber: d.studentNumber != null ? String(d.studentNumber) : null,
    nickname: d.nickname != null ? String(d.nickname) : null,
    studentProfileCompletedAt: d.studentProfileCompletedAt ?? null,
    billing: d.billing,
    welcomeEmailSentAt: d.welcomeEmailSentAt ?? null,
  };
}
