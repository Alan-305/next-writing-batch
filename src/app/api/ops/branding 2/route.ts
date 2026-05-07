import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { mergeStudentBranding } from "@/lib/student-branding";
import {
  readStudentBrandingForOrganization,
  writeStudentBrandingForOrganization,
} from "@/lib/student-branding-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** ログイン中教員の組織に紐づく生徒画面ブランディング（読み取り） */
export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  try {
    await migrateLegacyOrgLayoutOnce();
    const branding = await readStudentBrandingForOrganization(auth.organizationId);
    return NextResponse.json({ ok: true, branding });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "取得に失敗しました。",
      },
      { status: 500 },
    );
  }
}

/** 同上を上書き保存（生徒アプリの `/api/branding` と同じデータ源） */
export async function PUT(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が不正です。" }, { status: 400 });
  }

  const branding = mergeStudentBranding(body);

  try {
    await migrateLegacyOrgLayoutOnce();
    await writeStudentBrandingForOrganization(auth.organizationId, branding);
    return NextResponse.json({ ok: true, branding });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "保存に失敗しました。",
      },
      { status: 500 },
    );
  }
}
