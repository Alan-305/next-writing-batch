import { NextResponse } from "next/server";

import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";

import { verifyBearerUid, type VerifyBearerResult } from "./verify-bearer-uid";

export type VerifyBearerAndOrgResult =
  | { ok: true; uid: string; organizationId: string }
  | { ok: false; response: NextResponse };

export async function verifyBearerUidAndOrganization(request: Request): Promise<VerifyBearerAndOrgResult> {
  const auth: VerifyBearerResult = await verifyBearerUid(request);
  if (!auth.ok) return auth;
  const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
  return { ok: true, uid: auth.uid, organizationId };
}
