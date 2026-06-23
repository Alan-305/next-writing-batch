import { NextResponse } from "next/server";

import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export type AdminReadOnlyContext =
  | { ok: true; uid: string; organizationId: string }
  | { ok: false; response: NextResponse };

/** 管理者の閲覧専用 API 用（書き込み・テナント向け通知は行わない）。 */
export async function requireAdminReadOnlyContext(request: Request): Promise<AdminReadOnlyContext> {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  if (!isAllowlistedAdminUid(auth.uid)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 }),
    };
  }

  const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
  return { ok: true, uid: auth.uid, organizationId };
}

export function adminReadOnlyMethodNotAllowed(): NextResponse {
  return NextResponse.json({ ok: false, message: "この API は閲覧（GET）のみです。" }, { status: 405 });
}
