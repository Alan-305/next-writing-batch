import { promises as fs } from "node:fs";
import path from "node:path";

import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { organizationTeacherSetupDir } from "@/lib/org-data-layout";

export type TenantRosterMember = {
  uid: string;
  /** 表示用（Auth の displayName または email または uid） */
  displayLabel: string;
  email: string | null;
  roles: string[];
  kind: "teacher" | "student";
};

export type TenantRosterResult = {
  organizationId: string;
  teachers: TenantRosterMember[];
  students: TenantRosterMember[];
  note: string;
};

function normalizeRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === "string").map((r) => r.trim());
}

function isTeacherByRoles(roles: string[]): boolean {
  const lower = roles.map((r) => r.toLowerCase());
  return lower.includes("teacher") || lower.includes("admin");
}

async function loadTeacherUidsFromProofreadingSetup(organizationId: string): Promise<Set<string>> {
  const dir = organizationTeacherSetupDir(organizationId);
  const uids = new Set<string>();
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return uids;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const fp = path.join(dir, name);
    try {
      const raw = JSON.parse(await fs.readFile(fp, "utf8")) as Record<string, unknown>;
      const uid = String(raw.last_saved_by_uid ?? "").trim();
      if (uid) uids.add(uid);
    } catch {
      /* skip broken file */
    }
  }
  return uids;
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

function displayLabelFor(uid: string, email: string | null, displayName: string | null): string {
  const n = (displayName ?? "").trim();
  if (n) return n;
  const e = (email ?? "").trim();
  if (e) return e;
  return uid;
}

/**
 * Firestore users で organizationId が一致するユーザーを列挙し、教員 / 生徒に分類する。
 * 教員: roles に teacher または admin、または当該テナントの課題設定 JSON の last_saved_by_uid。
 */
export async function buildTenantRoster(organizationId: string): Promise<TenantRosterResult> {
  const oid = (organizationId ?? "").trim();
  const db = getAdminFirestore();
  const snap = await db.collection("users").where("organizationId", "==", oid).get();

  const teacherUidsFromDisk = await loadTeacherUidsFromProofreadingSetup(oid);
  const uids = snap.docs.map((d) => d.id);
  const authMap = await fetchAuthLabels(uids);

  const teachers: TenantRosterMember[] = [];
  const students: TenantRosterMember[] = [];

  for (const doc of snap.docs) {
    const uid = doc.id;
    const roles = normalizeRoles(doc.get("roles"));
    const fromDisk = teacherUidsFromDisk.has(uid);
    const kind: "teacher" | "student" = isTeacherByRoles(roles) || fromDisk ? "teacher" : "student";
    const auth = authMap.get(uid) ?? { email: null, displayName: null };
    const displayLabel = displayLabelFor(uid, auth.email, auth.displayName);
    const row: TenantRosterMember = { uid, displayLabel, email: auth.email, roles, kind };
    if (kind === "teacher") teachers.push(row);
    else students.push(row);
  }

  const sortByLabel = (a: TenantRosterMember, b: TenantRosterMember) =>
    a.displayLabel.localeCompare(b.displayLabel, "ja");

  teachers.sort(sortByLabel);
  students.sort(sortByLabel);

  const note =
    "Firestore の users に organizationId が入っているユーザーのみです。未設定（null）のままのユーザーは default などに紐づかないため一覧に出ません。";

  return {
    organizationId: oid,
    teachers,
    students,
    note,
  };
}
