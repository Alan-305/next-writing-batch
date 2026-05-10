import fs from "node:fs/promises";
import path from "node:path";

import { organizationDataRoot } from "@/lib/org-data-layout";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { mergeStudentBranding, type StudentBranding } from "@/lib/student-branding";
import {
  readStudentBrandingFromFirestore,
  writeStudentBrandingToFirestore,
} from "@/lib/student-branding-firestore";

function primaryBrandingFile(organizationId: string): string {
  return path.join(organizationDataRoot(organizationId), "branding.json");
}

/** NWB_DATA_ROOT 導入前: `process.cwd()/data/orgs/...` にだけあったファイルを読み戻す */
function legacyBrandingFile(organizationId: string): string {
  const oid = sanitizeOrganizationIdForPath(organizationId) || defaultOrganizationId();
  return path.join(process.cwd(), "data", "orgs", oid, "branding.json");
}

/**
 * 優先順位: Firestore `organizations/{org}.studentBranding` → ローカル `branding.json`。
 * Cloud Run では NWB_DATA_ROOT が揮発するため、Firestore を正とする。
 */
export async function readStudentBrandingForOrganization(organizationId: string): Promise<StudentBranding> {
  try {
    const fromDb = await readStudentBrandingFromFirestore(organizationId);
    if (fromDb !== null) return fromDb;
  } catch (e) {
    console.warn("[readStudentBrandingForOrganization] Firestore read failed, using file if any", e);
  }

  const primary = primaryBrandingFile(organizationId);
  try {
    const raw = JSON.parse(await fs.readFile(primary, "utf8")) as unknown;
    const merged = mergeStudentBranding(raw);
    void writeStudentBrandingToFirestore(organizationId, merged).catch((err) =>
      console.warn("[readStudentBrandingForOrganization] lazy Firestore sync skipped", err),
    );
    return merged;
  } catch {
    try {
      const raw = JSON.parse(await fs.readFile(legacyBrandingFile(organizationId), "utf8")) as unknown;
      const merged = mergeStudentBranding(raw);
      void writeStudentBrandingToFirestore(organizationId, merged).catch((err) =>
        console.warn("[readStudentBrandingForOrganization] lazy Firestore sync (legacy) skipped", err),
      );
      return merged;
    } catch {
      return mergeStudentBranding(null);
    }
  }
}

/**
 * 教員向け運用から保存。Firestore を正とし、ローカルはミラー（開発・バッチ互換）。
 */
export async function writeStudentBrandingForOrganization(
  organizationId: string,
  branding: StudentBranding,
): Promise<void> {
  await writeStudentBrandingToFirestore(organizationId, branding);
  const dir = organizationDataRoot(organizationId);
  const file = path.join(dir, "branding.json");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(branding, null, 2)}\n`, "utf8");
  } catch (e) {
    console.warn("[writeStudentBrandingForOrganization] file mirror failed", e);
  }
}
