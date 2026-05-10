import { FieldValue } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { mergeStudentBranding, type StudentBranding } from "@/lib/student-branding";

function organizationDocId(organizationId: string): string {
  return sanitizeOrganizationIdForPath(organizationId) || defaultOrganizationId();
}

/** `organizations/{orgId}.studentBranding`（提出と同じ org ドキュメント）。 */
export async function readStudentBrandingFromFirestore(organizationId: string): Promise<StudentBranding | null> {
  const db = getAdminFirestore();
  const id = organizationDocId(organizationId);
  const snap = await db.collection("organizations").doc(id).get();
  if (!snap.exists) return null;
  const raw = snap.get("studentBranding");
  if (raw === undefined || raw === null) return null;
  return mergeStudentBranding(raw);
}

export async function writeStudentBrandingToFirestore(
  organizationId: string,
  branding: StudentBranding,
): Promise<void> {
  const db = getAdminFirestore();
  const id = organizationDocId(organizationId);
  await db.collection("organizations").doc(id).set(
    {
      studentBranding: branding,
      studentBrandingUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
