import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { generateUniqueTenantOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  organizationId?: unknown;
  createNewTenant?: unknown;
};

/**
 * 教員の初回テナント参加（生徒の /api/invite/accept と対）。
 * - `createNewTenant: true` → サーバーが一意の organizationId（テナント ID）を生成
 * - 従来: `organizationId`（招待・既存テナント参加）
 */
export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const wantsNew =
    body.createNewTenant === true || body.createNewTenant === "true" || body.createNewTenant === 1;
  const orgRaw = String(body.organizationId ?? "").trim();
  const requestedOrg = sanitizeOrganizationIdForPath(orgRaw);

  if (wantsNew && requestedOrg) {
    return NextResponse.json(
      { ok: false, message: "createNewTenant と organizationId は同時に指定できません。" },
      { status: 400 },
    );
  }
  if (!wantsNew && !requestedOrg) {
    return NextResponse.json(
      { ok: false, message: "organizationId を指定するか、createNewTenant: true を指定してください。" },
      { status: 400 },
    );
  }

  const organizationId = wantsNew ? generateUniqueTenantOrganizationId() : requestedOrg;
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId が不正です。" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(auth.uid);

  const tx = await db.runTransaction(async (t) => {
    const snap = await t.get(userRef);
    const roles = snap.exists ? normalizeRoles(snap.get("roles")) : [];

    if (isTeacherByRoles(roles)) {
      const existingOrg = snap.exists ? String(snap.get("organizationId") ?? "").trim() : "";
      return {
        ok: true as const,
        changed: false,
        organizationId: existingOrg || organizationId,
      };
    }

    const lower = roles.map((r) => r.toLowerCase());
    if (lower.includes("student")) {
      return {
        error: "すでに生徒として登録されています。教員登録が必要な場合は管理者に依頼してください。",
        status: 409 as const,
      };
    }

    if (!snap.exists) {
      t.set(
        userRef,
        {
          roles: FieldValue.arrayUnion("teacher"),
          organizationId,
          billing: {
            tickets: 5,
            welcomeTicketsGranted: true,
          },
          createdAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return { ok: true as const, changed: true, organizationId };
    }

    const current = String(snap.get("organizationId") ?? "").trim();
    if (current && current !== organizationId) {
      return {
        error: "すでに別の organizationId が設定されています。移籍は管理者操作で変更してください。",
        status: 409 as const,
        currentOrganizationId: current,
      };
    }

    const existingBilling = (snap.get("billing") ?? {}) as Record<string, unknown>;
    const welcomeDone = existingBilling["welcomeTicketsGranted"] === true;
    const curTickets =
      typeof existingBilling["tickets"] === "number" && Number.isFinite(existingBilling["tickets"] as number)
        ? Math.max(0, Math.floor(existingBilling["tickets"] as number))
        : 0;

    t.set(
      userRef,
      {
        organizationId,
        roles: FieldValue.arrayUnion("teacher"),
        billing: {
          ...existingBilling,
          tickets: welcomeDone ? curTickets : curTickets + 5,
          welcomeTicketsGranted: true,
        },
      },
      { merge: true },
    );
    return { ok: true as const, changed: true, organizationId };
  });

  if ("error" in tx) {
    return NextResponse.json(
      {
        ok: false,
        message: tx.error,
        currentOrganizationId: tx.currentOrganizationId ?? undefined,
      },
      { status: tx.status },
    );
  }

  return NextResponse.json({
    ok: true,
    organizationId: tx.organizationId,
    changed: tx.changed,
  });
}
