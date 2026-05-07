import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  kind: "teacher" | "student";
  tickets: number;
  lastProofreadTicketConsume: number | null;
  lastProofreadTicketAt: string | null;
};

function normalizeRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string").map((r) => r.trim());
}

function isTeacherByRoles(roles: string[]): boolean {
  const lower = roles.map((r) => r.toLowerCase());
  return lower.includes("teacher") || lower.includes("admin");
}

function displayLabelFor(uid: string, email: string | null, displayName: string | null): string {
  const n = (displayName ?? "").trim();
  if (n) return n;
  const e = (email ?? "").trim();
  if (e) return e;
  return uid;
}

async function fetchAuthLabels(uids: string[]): Promise<Map<string, { email: string | null; displayName: string | null }>> {
  const auth = getAdminAuth();
  const map = new Map<string, { email: string | null; displayName: string | null }>();
  const chunk = 25;
  for (let i = 0; i < uids.length; i += chunk) {
    const slice = uids.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (uid) => {
        try {
          const u = await auth.getUser(uid);
          map.set(uid, { email: u.email ?? null, displayName: u.displayName ?? null });
        } catch {
          map.set(uid, { email: null, displayName: null });
        }
      }),
    );
  }
  return map;
}

function numberOrZero(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
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

async function canViewTeacherRoster(uid: string): Promise<boolean> {
  if (isAllowlistedAdminUid(uid)) return true;
  const snap = await getAdminFirestore().collection("users").doc(uid).get();
  if (!snap.exists) return false;
  return isTeacherByRoles(normalizeRoles(snap.get("roles")));
}

export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!(await canViewTeacherRoster(auth.uid))) {
    return NextResponse.json({ ok: false, message: "教員または管理者のみが利用できます。" }, { status: 403 });
  }

  try {
    const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
    const db = getAdminFirestore();
    const snap = await db.collection("users").where("organizationId", "==", organizationId).get();
    const uids = snap.docs.map((d) => d.id);
    const authMap = await fetchAuthLabels(uids);

    const rows: TicketRow[] = snap.docs.map((doc) => {
      const uid = doc.id;
      const roles = normalizeRoles(doc.get("roles"));
      const isTeacherLike = uid === auth.uid || isAllowlistedAdminUid(uid) || isTeacherByRoles(roles);
      const kind: "teacher" | "student" = isTeacherLike ? "teacher" : "student";
      const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
      const tickets = Math.max(0, Math.floor(numberOrZero(billing["tickets"])));
      const lastConsumeRaw = billing["lastProofreadTicketConsume"];
      const lastProofreadTicketConsume =
        typeof lastConsumeRaw === "number" && Number.isFinite(lastConsumeRaw) ? Math.floor(lastConsumeRaw) : null;
      const lastProofreadTicketAt = timestampToIso(billing["lastProofreadTicketAt"]);
      const authLabel = authMap.get(uid) ?? { email: null, displayName: null };
      const displayLabel = displayLabelFor(uid, authLabel.email, authLabel.displayName);
      return {
        uid,
        displayLabel,
        email: authLabel.email,
        kind,
        tickets,
        lastProofreadTicketConsume,
        lastProofreadTicketAt,
      };
    });

    const teachers = rows.filter((r) => r.kind === "teacher").sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, "ja"));
    const students = rows.filter((r) => r.kind === "student").sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, "ja"));

    return NextResponse.json({
      ok: true,
      organizationId,
      teachers,
      students,
      teacherCount: teachers.length,
      studentCount: students.length,
      note: "消費履歴は現状『直近1回分』のみ（billing.lastProofreadTicketConsume / lastProofreadTicketAt）。",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "取得に失敗しました。" },
      { status: 500 },
    );
  }
}

