import {
  findSubmissionAcrossOrganizations,
  type SubmissionWithOrganization,
} from "@/lib/submissions-store";

/**
 * 提出を検索し、ストア上のテナント（`data/orgs/{id}/`）がリクエストの組織と一致する場合のみ返す。
 */
export async function findSubmissionForTenant(
  submissionId: string,
  requestOrganizationId: string,
): Promise<SubmissionWithOrganization | null> {
  const hit = await findSubmissionAcrossOrganizations(submissionId);
  if (!hit) return null;
  if (hit.organizationId !== requestOrganizationId) {
    return null;
  }
  return hit;
}
