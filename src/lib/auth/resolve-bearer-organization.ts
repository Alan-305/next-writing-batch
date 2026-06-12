import { NextResponse } from "next/server";

import { resolveOrganizationIdForTenantUid } from "@/lib/auth/resolve-effective-organization";

import { verifyBearerUid, type VerifyBearerResult } from "./verify-bearer-uid";

export type VerifyBearerAndOrgResult =
  | { ok: true; uid: string; organizationId: string }
  | { ok: false; response: NextResponse };

export async function verifyBearerUidAndOrganization(request: Request): Promise<VerifyBearerAndOrgResult> {
  const auth: VerifyBearerResult = await verifyBearerUid(request);
  if (!auth.ok) return auth;
  const organizationId = await resolveOrganizationIdForTenantUid(auth.uid);
  return { ok: true, uid: auth.uid, organizationId };
}
