import { NextResponse } from "next/server";

import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

/**
 * テナント運用（提出一覧・添削・ZIP・キー設定など）を行えるか。
 * 管理者 allowlist、または Firestore roles に teacher / admin を持つユーザーのみ。
 */
export async function canManageTenantOperations(uid: string): Promise<boolean> {
  if (isAllowlistedAdminUid(uid)) return true;
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return false;
  return isTeacherByRoles(normalizeRoles(snap.get("roles")));
}

export async function requireTeacherOrAllowlistAdmin(uid: string): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  if (await canManageTenantOperations(uid)) return { ok: true };
  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        code: "FORBIDDEN",
        message: "教員または管理者のみがこの操作を実行できます。",
      },
      { status: 403 },
    ),
  };
}
