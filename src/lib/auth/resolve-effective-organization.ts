import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { describeOrganizationIdForUid, getAdminFirestore, resolveOrganizationIdForUid } from "@/lib/firebase/admin-firestore";
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

function normalizeRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string").map((r) => r.trim().toLowerCase());
}

function isTeacherByRoles(roles: string[]): boolean {
  return roles.includes("teacher") || roles.includes("admin");
}

function teacherOrgFromUid(uid: string): string {
  const candidate = sanitizeOrganizationIdForPath(`org_${uid}`)?.toLowerCase();
  if (candidate) return candidate;
  return "org_default";
}

async function ensureTeacherOrganizationId(uid: string): Promise<string> {
  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const generated = teacherOrgFromUid(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      tx.set(
        userRef,
        {
          roles: ["teacher"],
          organizationId: generated,
          billing: {},
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return;
    }
    const current = String(snap.get("organizationId") ?? "").trim();
    if (current) return;
    tx.set(userRef, { organizationId: generated }, { merge: true });
  });

  return generated;
}

/**
 * API 用の組織 ID。管理者 allowlist かつ代理 Cookie があればそれを優先し、それ以外は Firestore の users/{uid}.organizationId。
 */
export async function resolveEffectiveOrganizationIdForApi(uid: string, request: Request): Promise<string> {
  if (isAllowlistedAdminUid(uid)) {
    const acting = getAdminActingOrganizationIdFromRequest(request);
    if (acting) return acting;
    const resolved = await describeOrganizationIdForUid(uid);
    if (!resolved.usedFallback) return resolved.resolvedOrganizationId;
    return ensureTeacherOrganizationId(uid);
  }

  const resolved = await describeOrganizationIdForUid(uid);
  if (!resolved.usedFallback) return resolved.resolvedOrganizationId;

  try {
    const snap = await getAdminFirestore().collection("users").doc(uid).get();
    if (!snap.exists) return resolveOrganizationIdForUid(uid);
    const roles = normalizeRoles(snap.get("roles"));
    if (isTeacherByRoles(roles)) {
      return ensureTeacherOrganizationId(uid);
    }
  } catch {
    // 読み取り失敗時は従来どおり fallback（default）を返す。
  }

  return resolveOrganizationIdForUid(uid);
}
