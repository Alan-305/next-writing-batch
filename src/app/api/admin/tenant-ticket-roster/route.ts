import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { resolveEffectiveOrganizationIdForApi } from "@/lib/auth/resolve-effective-organization";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { nearestTicketExpiryIso, resolveBillingTicketLots, sumTicketLots } from "@/lib/billing/ticket-lots";
import {
  countDay4TicketsChargedByTeacher,
  readLifetimeTicketsConsumed,
} from "@/lib/billing/teacher-ticket-usage";
import { loadTeacherUidsFromProofreadingSetup } from "@/lib/admin/tenant-roster";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { getSubmissions } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TicketRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  nickname: string | null;
  studentNumber: string | null;
  roles: string[];
  kind: "teacher" | "student";
  statusLabel: string;
  registeredAt: string | null;
  tickets: number;
  ticketExpiresAt: string | null;
  /** 確定公開（Day4）で消費したチケットの累計（提出記録ベース） */
  cumulativeProofreadTickets: number;
  /** billing.lifetimeTicketsConsumed（サーバー記録。提出記録と照合用） */
  lifetimeTicketsConsumed: number;
  lastProofreadTicketConsume: number | null;
  lastProofreadTicketAt: string | null;
  lastCheckoutSessionId: string | null;
  lastPaymentIntentId: string | null;
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

type AuthLabel = {
  email: string | null;
  displayName: string | null;
  registeredAt: string | null;
};

async function fetchAuthLabels(uids: string[]): Promise<Map<string, AuthLabel>> {
  const auth = getAdminAuth();
  const map = new Map<string, AuthLabel>();
  const chunk = 25;
  for (let i = 0; i < uids.length; i += chunk) {
    const slice = uids.slice(i, i + chunk);
    await Promise.all(
      slice.map(async (uid) => {
        try {
          const u = await auth.getUser(uid);
          const created = u.metadata?.creationTime;
          map.set(uid, {
            email: u.email ?? null,
            displayName: u.displayName ?? null,
            registeredAt: created ? new Date(created).toISOString() : null,
          });
        } catch {
          map.set(uid, { email: null, displayName: null, registeredAt: null });
        }
      }),
    );
  }
  return map;
}

function statusLabelFor(kind: "teacher" | "student", roles: string[], profileCompleted: boolean): string {
  const lower = roles.map((r) => r.toLowerCase());
  if (kind === "teacher") {
    if (lower.includes("admin")) return "管理者・教員";
    return "教員";
  }
  return profileCompleted ? "生徒（登録済）" : "生徒（未登録）";
}

function stringOrNull(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
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

export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  // 現状は /admin 配下に置く想定なので allowlist 管理者のみ。
  // 教員ロールでの閲覧を解放したい場合は、ここで users/{uid}.roles を参照して判定する。
  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  try {
    const organizationId = await resolveEffectiveOrganizationIdForApi(auth.uid, request);
    const db = getAdminFirestore();
    const teacherUidsFromDisk = await loadTeacherUidsFromProofreadingSetup(organizationId);
    const submissions = await getSubmissions(organizationId);
    const snap = await db.collection("users").where("organizationId", "==", organizationId).get();
    const uids = snap.docs.map((d) => d.id);
    const authMap = await fetchAuthLabels(uids);

    const rows: TicketRow[] = snap.docs.map((doc) => {
      const uid = doc.id;
      const roles = normalizeRoles(doc.get("roles"));
      const kind: "teacher" | "student" =
        isTeacherByRoles(roles) || teacherUidsFromDisk.has(uid) ? "teacher" : "student";
      const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
      const { lots } = resolveBillingTicketLots(billing);
      const tickets = sumTicketLots(lots);
      const ticketExpiresAt = tickets > 0 ? nearestTicketExpiryIso(lots) : null;
      const lastConsumeRaw = billing["lastProofreadTicketConsume"];
      const lastProofreadTicketConsume =
        typeof lastConsumeRaw === "number" && Number.isFinite(lastConsumeRaw) ? Math.floor(lastConsumeRaw) : null;
      const lastProofreadTicketAt = timestampToIso(billing["lastProofreadTicketAt"]);
      const authLabel = authMap.get(uid) ?? { email: null, displayName: null, registeredAt: null };
      const displayLabel = displayLabelFor(uid, authLabel.email, authLabel.displayName);
      const nickname = stringOrNull(doc.get("nickname"));
      const studentNumber = stringOrNull(doc.get("studentNumber"));
      const profileCompleted = doc.get("studentProfileCompletedAt") != null;
      const docCreatedAt = timestampToIso(doc.get("createdAt"));
      const lifetimeTicketsConsumed = readLifetimeTicketsConsumed(billing);
      return {
        uid,
        displayLabel,
        email: authLabel.email,
        nickname,
        studentNumber,
        roles,
        kind,
        statusLabel: statusLabelFor(kind, roles, profileCompleted),
        registeredAt: authLabel.registeredAt ?? docCreatedAt,
        tickets,
        ticketExpiresAt,
        cumulativeProofreadTickets: 0,
        lifetimeTicketsConsumed,
        lastProofreadTicketConsume,
        lastProofreadTicketAt,
        lastCheckoutSessionId: stringOrNull(billing["lastCheckoutSessionId"]),
        lastPaymentIntentId: stringOrNull(billing["lastPaymentIntentId"]),
      };
    });

    const teachers = rows.filter((r) => r.kind === "teacher").sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, "ja"));
    const students = rows.filter((r) => r.kind === "student").sort((a, b) => a.displayLabel.localeCompare(b.displayLabel, "ja"));

    const teacherUidList = teachers.map((t) => t.uid);
    const chargeCounts = countDay4TicketsChargedByTeacher(submissions, teacherUidList);
    const teachersWithUsage = teachers.map((t) => {
      const fromSubmissions = chargeCounts.byUid.get(t.uid) ?? 0;
      const fromBilling = t.lifetimeTicketsConsumed;
      return {
        ...t,
        cumulativeProofreadTickets: Math.max(fromSubmissions, fromBilling),
      };
    });

    const usageNote =
      chargeCounts.unattributed > 0
        ? `過去の確定公開 ${chargeCounts.unattributed} 件は消費教員が記録されていないため、教員別累計に含まれていません。`
        : null;

    return NextResponse.json({
      ok: true,
      organizationId,
      teachers: teachersWithUsage,
      students,
      teacherCount: teachers.length,
      studentCount: students.length,
      orgCumulativeProofreadTickets: chargeCounts.orgTotal,
      unattributedProofreadTickets: chargeCounts.unattributed,
      usageNote,
      note: null,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "取得に失敗しました。" },
      { status: 500 },
    );
  }
}

