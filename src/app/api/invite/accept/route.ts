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
  const tx = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    if (!snap.exists) {
      // Auth.onCreate より先に招待 API が呼ばれるケースを許容する（初回ログイン直後の競合対策）。
      t.set(
        userRef,
        {
          roles: [],
          organizationId,
          billing: {},
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { changed: true, organizationId };
    }

    const roles = normalizeRoles(snap.get("roles"));
    if (isTeacherByRoles(roles)) {
      return { error: "教員アカウントには招待リンクを適用できません。", status: 400 as const };
    }

    const current = String(snap.get("organizationId") ?? "").trim();
    if (current && current !== organizationId) {
      return {
        error: "すでに別の organizationId が設定されています。移籍は管理者操作で変更してください。",
        status: 409 as const,
        currentOrganizationId: current,
      };
    }

    if (current !== organizationId) {
      t.set(userRef, { organizationId }, { merge: true });
      return { changed: true, organizationId };
    }
    return { changed: false, organizationId };
  });

  if ("error" in tx) {
    return NextResponse.json(
      { ok: false, message: tx.error, currentOrganizationId: tx.currentOrganizationId ?? undefined },
      { status: tx.status },
    );
  }

  return NextResponse.json({
    ok: true,
    organizationId: tx.organizationId,
    changed: tx.changed,
  });
}

