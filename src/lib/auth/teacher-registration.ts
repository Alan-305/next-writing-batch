import { isTeacherByRoles } from "@/lib/auth/user-roles";

/** Auth 作成直後など、教員テナント未割当の状態か */
export function needsTeacherTenantSetup(
  roles: string[],
  organizationId: string | null | undefined,
): boolean {
  if (isTeacherByRoles(roles)) return false;
  if (roles.some((r) => r.toLowerCase() === "student")) return false;
  return !(organizationId ?? "").trim();
}

/** 教員・運用エリアへの遷移先か（ログイン後に教員登録 API を要する） */
export function isTeacherEntryPath(next: string): boolean {
  const p = (next ?? "").trim();
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  return p === "/ops" || p.startsWith("/ops/") || p.startsWith("/register/teacher");
}

export function teacherRegisterPath(next: string): string {
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/ops/invite";
  return `/register/teacher?next=${encodeURIComponent(safe)}`;
}

/** クライアント: 教員テナント作成 API（createNewTenant） */
export async function postTeacherRegistration(
  idToken: string,
): Promise<{ ok: boolean; organizationId?: string; message?: string }> {
  const res = await fetch("/api/register/teacher", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ createNewTenant: true }),
  });
  const j = (await res.json()) as { ok?: boolean; organizationId?: string; message?: string };
  return {
    ok: Boolean(res.ok && j?.ok),
    organizationId: j.organizationId,
    message: j.message,
  };
}
