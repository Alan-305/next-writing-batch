import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { describeOrganizationIdForUid, getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tenantDevSelfAssignAllowed(): boolean {
  return process.env.TENANT_DEV_SELF_ASSIGN === "true";
}

type PostBody = { organizationId?: unknown; useDefault?: unknown };

/**
 * 開発検証用: 自分の `users/{uid}.organizationId` だけを更新する。
 * 本番では `TENANT_DEV_SELF_ASSIGN` を付けないこと。
 */
export async function POST(request: Request) {
  if (!tenantDevSelfAssignAllowed()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "この API は無効です。ローカルでテナント切り替えを試すときだけ、.env.local に TENANT_DEV_SELF_ASSIGN=true を入れてサーバーを再起動してください。",
      },
      { status: 403 },
    );
  }

  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が不正です。" }, { status: 400 });
  }

  const useDefault = body.useDefault === true;
  const raw = body.organizationId;

  if (useDefault) {
    await getAdminFirestore().collection("users").doc(auth.uid).set({ organizationId: null }, { merge: true });
    const resolution = await describeOrganizationIdForUid(auth.uid);
    return NextResponse.json({ ok: true, resolution });
  }

  if (raw === undefined) {
    return NextResponse.json({ ok: false, message: "organizationId か useDefault を指定してください。" }, { status: 400 });
  }

  if (raw === null) {
    await getAdminFirestore().collection("users").doc(auth.uid).set({ organizationId: null }, { merge: true });
    const resolution = await describeOrganizationIdForUid(auth.uid);
    return NextResponse.json({ ok: true, resolution });
  }

  if (typeof raw !== "string") {
    return NextResponse.json({ ok: false, message: "organizationId は文字列である必要があります。" }, { status: 422 });
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    await getAdminFirestore().collection("users").doc(auth.uid).set({ organizationId: null }, { merge: true });
    const resolution = await describeOrganizationIdForUid(auth.uid);
    return NextResponse.json({ ok: true, resolution });
  }

  const sanitized = sanitizeOrganizationIdForPath(trimmed);
  if (!sanitized) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "organizationId をディレクトリ名に使えません。英数字・ハイフン・アンダースコアのみにしてください（Firestore の値は正規化されます）。",
      },
      { status: 422 },
    );
  }

  await getAdminFirestore().collection("users").doc(auth.uid).set({ organizationId: sanitized }, { merge: true });
  const resolution = await describeOrganizationIdForUid(auth.uid);
  return NextResponse.json({ ok: true, resolution });
}
