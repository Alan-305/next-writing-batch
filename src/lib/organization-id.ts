/**
 * マルチテナント用の組織 ID（URL・Firestore `users/{uid}.organizationId` と一致させる）。
 * ディレクトリ名に使うため、英数字・-_ のみに正規化する。
 */
import { randomBytes } from "node:crypto";

/**
 * 新規教員用のテナント ID。英数字とアンダースコアのみ（最大64文字）。衝突確率は実用上無視可。
 */
export function generateUniqueTenantOrganizationId(): string {
  const suffix = randomBytes(16).toString("hex");
  const id = `t_${suffix}`;
  const safe = sanitizeOrganizationIdForPath(id);
  return safe || id;
}

export function defaultOrganizationId(): string {
  const raw = (process.env.DEFAULT_ORGANIZATION_ID ?? "").trim();
  return raw ? sanitizeOrganizationIdForPath(raw) : "default";
}

export function sanitizeOrganizationIdForPath(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  const safe = t.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return safe || "";
}
