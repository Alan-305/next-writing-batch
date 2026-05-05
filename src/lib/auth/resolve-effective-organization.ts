import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { resolveOrganizationIdForUid } from "@/lib/firebase/admin-firestore";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";

/** HttpOnly Cookie 名（管理者が API 解決で「代理」するテナント） */
export const ADMIN_ACTING_ORG_COOKIE = "nwb_admin_acting_org";

function parseCookieFromHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k !== name) continue;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

export function getAdminActingOrganizationIdFromRequest(request: Request): string | null {
  const raw = parseCookieFromHeader(request.headers.get("cookie"), ADMIN_ACTING_ORG_COOKIE);
  if (!raw) return null;
  const s = sanitizeOrganizationIdForPath(raw.trim());
  return s || null;
}

/**
 * API 用の組織 ID。管理者 allowlist かつ代理 Cookie があればそれを優先し、それ以外は Firestore の users/{uid}.organizationId。
 */
export async function resolveEffectiveOrganizationIdForApi(uid: string, request: Request): Promise<string> {
  if (isAllowlistedAdminUid(uid)) {
    const acting = getAdminActingOrganizationIdFromRequest(request);
    if (acting) return acting;
  }
  return resolveOrganizationIdForUid(uid);
}
