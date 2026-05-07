import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string").map((r) => r.trim());
}

function isTeacherByRoles(roles: string[]): boolean {
  const lower = roles.map((r) => r.toLowerCase());
  return lower.includes("teacher") || lower.includes("admin");
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const orgRaw = String((body as { organizationId?: unknown })?.organizationId ?? "").trim();
  const organizationId = sanitizeOrganizationIdForPath(orgRaw);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId が不正です。" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(auth.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, message: "ユーザーが見つかりません。" }, { status: 404 });
  }

  const roles = normalizeRoles(snap.get("roles"));
  if (isTeacherByRoles(roles)) {
    return NextResponse.json({ ok: false, message: "教員アカウントには招待リンクを適用できません。" }, { status: 400 });
  }

  const current = String(snap.get("organizationId") ?? "").trim();
  if (current && current !== organizationId) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "すでに別の organizationId が設定されています。移籍は管理者操作で変更してください。",
        currentOrganizationId: current,
      },
      { status: 409 },
    );
  }

  if (current !== organizationId) {
    await userRef.set({ organizationId }, { merge: true });
  }

  return NextResponse.json({
    ok: true,
    organizationId,
    changed: current !== organizationId,
  });
}

