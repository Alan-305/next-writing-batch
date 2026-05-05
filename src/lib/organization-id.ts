/**
 * マルチテナント用の組織 ID（URL・Firestore `users/{uid}.organizationId` と一致させる）。
 * ディレクトリ名に使うため、英数字・-_ のみに正規化する。
 */
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
