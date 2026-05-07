import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  ADMIN_ACTING_ORG_COOKIE,
  getAdminActingOrganizationIdFromRequest,
  resolveEffectiveOrganizationIdForApi,
} from "@/lib/auth/resolve-effective-organization";
import { describeOrganizationIdForUid } from "@/lib/firebase/admin-firestore";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { listOrganizationIdsOnDisk } from "@/lib/org-data-layout";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PostBody = { organizationId?: unknown };

export async function GET(_request: Request) {
  const auth = await verifyBearerUid(_request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  try {
    const orgsOnDisk = (await listOrganizationIdsOnDisk()).sort();
    const actingOrganizationId = getAdminActingOrganizationIdFromRequest(_request);
    const effectiveOrganizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, _request);
    const profile = await describeOrganizationIdForUid(auth.uid);
    return NextResponse.json({
      ok: true,
      orgsOnDisk,
      actingOrganizationId,
      effectiveOrganizationId,
      profileOrganizationId: profile.resolvedOrganizationId,
      profileUsedFallback: profile.usedFallback,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が不正です。" }, { status: 400 });
  }

  const raw = body.organizationId;
  const res = NextResponse.json({ ok: true as const });

  if (raw === null || raw === undefined) {
    res.cookies.set(ADMIN_ACTING_ORG_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  if (typeof raw !== "string") {
    return NextResponse.json({ ok: false, message: "organizationId は文字列または null です。" }, { status: 422 });
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    res.cookies.set(ADMIN_ACTING_ORG_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return res;
  }

  const sanitized = sanitizeOrganizationIdForPath(trimmed);
  if (!sanitized) {
    return NextResponse.json(
      {
        ok: false,
        message: "organizationId をディレクトリ名に使えません。英数字・ハイフン・アンダースコアのみにしてください。",
      },
      { status: 422 },
    );
  }

  res.cookies.set(ADMIN_ACTING_ORG_COOKIE, sanitized, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });

  return res;
}
