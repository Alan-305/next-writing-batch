import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

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

async function canGrantTickets(uid: string): Promise<boolean> {
  if (isAllowlistedAdminUid(uid)) return true;
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return false;
  return isTeacherByRoles(normalizeRoles(snap.get("roles")));
}

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  return i > 0 ? i : null;
}

function timestampToIso(raw: unknown): string | null {
  const maybe = raw as { toDate?: () => Date } | null;
  if (!maybe || typeof maybe !== "object" || typeof maybe.toDate !== "function") return null;
  try {
    return maybe.toDate().toISOString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!(await canGrantTickets(auth.uid))) {
    return NextResponse.json({ ok: false, message: "教員または管理者のみが利用できます。" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, rawLimit)) : 20;

  const db = getAdminFirestore();
  const baseRef = db.collection("users").doc(auth.uid).collection("ticket_grants");
  const snap = await baseRef.orderBy("createdAt", "desc").limit(limit).get();
  const targetUids = Array.from(
    new Set(
      snap.docs
        .map((d) => String(d.get("targetUid") ?? "").trim())
        .filter((uid) => uid.length > 0),
    ),
  );

  const kindMap = new Map<string, string>();
  const displayMap = new Map<string, { displayLabel: string; email: string | null }>();
  const adminAuth = getAdminAuth();
  await Promise.all(
    targetUids.map(async (uid) => {
      try {
        const us = await db.collection("users").doc(uid).get();
        if (us.exists) {
          const roles = normalizeRoles(us.get("roles"));
          const roleLabel = isTeacherByRoles(roles) ? "teacher" : "student";
          kindMap.set(uid, roleLabel);
        }
      } catch {
        // noop
      }
      if (!kindMap.has(uid)) kindMap.set(uid, "unknown");

      try {
        const au = await adminAuth.getUser(uid);
        const displayLabel = (au.displayName ?? "").trim() || (au.email ?? "").trim() || uid;
        displayMap.set(uid, { displayLabel, email: au.email ?? null });
      } catch {
        displayMap.set(uid, { displayLabel: uid, email: null });
      }
    }),
  );

  const history = snap.docs.map((d) => ({
    id: d.id,
    targetUid: String(d.get("targetUid") ?? ""),
    amount: Number(d.get("amount") ?? 0),
    note: d.get("note") ? String(d.get("note")) : null,
    organizationId: d.get("organizationId") ? String(d.get("organizationId")) : null,
    createdAt: timestampToIso(d.get("createdAt")),
    targetKind: kindMap.get(String(d.get("targetUid") ?? "")) ?? "unknown",
    targetDisplayLabel:
      displayMap.get(String(d.get("targetUid") ?? ""))?.displayLabel ?? String(d.get("targetUid") ?? ""),
    targetEmail: displayMap.get(String(d.get("targetUid") ?? ""))?.email ?? null,
  }));

  return NextResponse.json({
    ok: true,
    history,
  });
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!(await canGrantTickets(auth.uid))) {
    return NextResponse.json({ ok: false, message: "教員または管理者のみが利用できます。" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const targetUid = String((body as { targetUid?: unknown })?.targetUid ?? "").trim();
  const amount = parsePositiveInt((body as { amount?: unknown })?.amount);
  const noteRaw = String((body as { note?: unknown })?.note ?? "").trim();
  const note = noteRaw.length ? noteRaw.slice(0, 200) : null;
  if (!targetUid || !amount) {
    return NextResponse.json(
      { ok: false, message: "targetUid と amount（正の整数）は必須です。" },
      { status: 400 },
    );
  }
  if (targetUid === auth.uid) {
    return NextResponse.json({ ok: false, message: "自分自身への配布はできません。" }, { status: 400 });
  }

  const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
  const db = getAdminFirestore();
  const fromRef = db.collection("users").doc(auth.uid);
  const toRef = db.collection("users").doc(targetUid);
  const grantRef = fromRef.collection("ticket_grants").doc();

  try {
    let fromAfter = 0;
    let toAfter = 0;
    await db.runTransaction(async (tx) => {
      const [fromSnap, toSnap] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
      if (!fromSnap.exists) throw new Error("SOURCE_NOT_FOUND");
      if (!toSnap.exists) throw new Error("TARGET_NOT_FOUND");

      const fromOrg = String(fromSnap.get("organizationId") ?? "").trim();
      const toOrg = String(toSnap.get("organizationId") ?? "").trim();
      if (!fromOrg || !toOrg || fromOrg !== organizationId || toOrg !== organizationId) {
        throw new Error("ORG_MISMATCH");
      }

      const toRoles = normalizeRoles(toSnap.get("roles"));
      if (isTeacherByRoles(toRoles)) {
        throw new Error("TARGET_NOT_STUDENT");
      }

      const fromBilling = (fromSnap.get("billing") ?? {}) as Record<string, unknown>;
      const toBilling = (toSnap.get("billing") ?? {}) as Record<string, unknown>;
      const fromNow =
        typeof fromBilling["tickets"] === "number" && Number.isFinite(fromBilling["tickets"])
          ? Math.floor(fromBilling["tickets"] as number)
          : 0;
      const toNow =
        typeof toBilling["tickets"] === "number" && Number.isFinite(toBilling["tickets"])
          ? Math.floor(toBilling["tickets"] as number)
          : 0;

      if (fromNow < amount) throw new Error("INSUFFICIENT");

      fromAfter = Math.max(0, fromNow - amount);
      toAfter = Math.max(0, toNow + amount);

      tx.update(fromRef, {
        billing: {
          ...fromBilling,
          tickets: fromAfter,
          lastDistributedTicketOut: amount,
          lastDistributedTicketOutToUid: targetUid,
          lastDistributedTicketAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.update(toRef, {
        billing: {
          ...toBilling,
          tickets: toAfter,
          lastDistributedTicketIn: amount,
          lastDistributedTicketFromUid: auth.uid,
          lastDistributedTicketAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.set(grantRef, {
        fromUid: auth.uid,
        targetUid,
        amount,
        organizationId,
        note,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({
      ok: true,
      fromUid: auth.uid,
      targetUid,
      amount,
      fromTicketsAfter: fromAfter,
      targetTicketsAfter: toAfter,
      organizationId,
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "INSUFFICIENT") {
      return NextResponse.json({ ok: false, message: "配布元チケットが不足しています。" }, { status: 409 });
    }
    if (code === "TARGET_NOT_STUDENT") {
      return NextResponse.json({ ok: false, message: "配布先は生徒のみ指定できます。" }, { status: 400 });
    }
    if (code === "ORG_MISMATCH") {
      return NextResponse.json({ ok: false, message: "同一テナントのユーザーにのみ配布できます。" }, { status: 400 });
    }
    if (code === "SOURCE_NOT_FOUND" || code === "TARGET_NOT_FOUND") {
      return NextResponse.json({ ok: false, message: "ユーザーが見つかりません。" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, message: "配布処理に失敗しました。" }, { status: 500 });
  }
}

