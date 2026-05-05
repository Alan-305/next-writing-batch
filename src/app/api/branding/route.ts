import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { readStudentBrandingForOrganization } from "@/lib/student-branding-store";

export const runtime = "nodejs";

/**
 * ログイン中ユーザーの organization に紐づく生徒画面用ブランディング（色・表示名）。
 * 機密は含めない。
 */
export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const branding = await readStudentBrandingForOrganization(auth.organizationId);
  return NextResponse.json(branding);
}
