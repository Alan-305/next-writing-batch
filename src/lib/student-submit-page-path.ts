import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import type { Submission } from "@/lib/submissions-store";

/** 提出ドキュメントと Firestore パスからテナント ID を解決 */
export function organizationIdFromSubmissionHit(
  organizationIdFromPath: string,
  submission: Submission,
): string {
  return sanitizeOrganizationIdForPath(organizationIdFromPath || submission.organizationId || "");
}

/** 匿名生徒の提出・受け取りページ（担当教員テナント付き）。org が無効なら null */
export function studentSubmitPagePath(organizationId: string): string | null {
  const org = sanitizeOrganizationIdForPath(organizationId);
  if (!org) return null;
  return `/submit?org=${encodeURIComponent(org)}`;
}
