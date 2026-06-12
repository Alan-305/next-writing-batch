import { NextResponse } from "next/server";

import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { readStudentBrandingForOrganization } from "@/lib/student-branding-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 招待リンク先の生徒画面用ブランディング（ログイン不要・org 指定） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgRaw = (url.searchParams.get("org") ?? "").trim();
  const organizationId = sanitizeOrganizationIdForPath(orgRaw);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "org パラメータが必要です。" }, { status: 400 });
  }

  const branding = await readStudentBrandingForOrganization(organizationId);
  return NextResponse.json({ ok: true, organizationId, ...branding });
}
