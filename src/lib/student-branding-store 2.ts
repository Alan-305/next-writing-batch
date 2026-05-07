import fs from "node:fs/promises";
import path from "node:path";

import { mergeStudentBranding, type StudentBranding } from "@/lib/student-branding";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";

function brandingFilePath(organizationId: string): { oid: string; dir: string; file: string } {
  const oid = sanitizeOrganizationIdForPath(organizationId) || "default";
  const dir = path.join(process.cwd(), "data", "orgs", oid);
  const file = path.join(dir, "branding.json");
  return { oid, dir, file };
}

/**
 * `data/orgs/{organizationId}/branding.json`（任意）。
 * 無い・壊れている場合は merge のデフォルトのみ。
 */
export async function readStudentBrandingForOrganization(organizationId: string): Promise<StudentBranding> {
  const { file: fp } = brandingFilePath(organizationId);
  try {
    const raw = JSON.parse(await fs.readFile(fp, "utf8")) as unknown;
    return mergeStudentBranding(raw);
  } catch {
    return mergeStudentBranding(null);
  }
}

/** 教員向け運用から保存。同一 organization の生徒 `/api/branding` が読むファイルと一致する。 */
export async function writeStudentBrandingForOrganization(
  organizationId: string,
  branding: StudentBranding,
): Promise<void> {
  const { dir, file } = brandingFilePath(organizationId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(branding, null, 2)}\n`, "utf8");
}
