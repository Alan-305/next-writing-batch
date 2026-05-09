import fs from "node:fs/promises";
import path from "node:path";

import { organizationDataRoot } from "@/lib/org-data-layout";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { mergeStudentBranding, type StudentBranding } from "@/lib/student-branding";

function primaryBrandingFile(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "branding.json");
}

/** NWB_DATA_ROOT 導入前: `process.cwd()/data/orgs/...` にだけあったファイルを読み戻す */
function legacyBrandingFile(organizationId: string): string {
  const oid = sanitizeOrganizationIdForPath(organizationId) || defaultOrganizationId();
  return path.join(process.cwd(), "data", "orgs", oid, "branding.json");
}

/**
 * `data/orgs/{organizationId}/branding.json`（NWB_DATA_ROOT 利用時はその配下の orgs）。
 * 無い・壊れている場合は merge のデフォルトのみ。
 */
export async function readStudentBrandingForOrganization(organizationId: string): Promise<StudentBranding> {
  const primary = primaryBrandingFile(organizationId);
  try {
    const raw = JSON.parse(await fs.readFile(primary, "utf8")) as unknown;
    return mergeStudentBranding(raw);
  } catch {
    try {
      const raw = JSON.parse(await fs.readFile(legacyBrandingFile(organizationId), "utf8")) as unknown;
      return mergeStudentBranding(raw);
    } catch {
      return mergeStudentBranding(null);
    }
  }
}

/** 教員向け運用から保存。`organizationDataRoot` と提出データ等と同一ルート（Cloud Run の NWB_DATA_ROOT と整合）。 */
export async function writeStudentBrandingForOrganization(
  organizationId: string,
  branding: StudentBranding,
): Promise<void> {
  const dir = organizationDataRoot(organizationId);
  const file = path.join(dir, "branding.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(branding, null, 2)}\n`, "utf8");
}
