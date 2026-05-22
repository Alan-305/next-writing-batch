import type { CollectionReference, Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import {
  ensureOrganizationDataDir,
  listOrganizationIdsFromFirestore,
  listOrganizationIdsOnDisk,
  removeOrganizationDataDir,
} from "@/lib/org-data-layout";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";

const CHUNK = 400;

/** Firestore クエリ用: 生値と正規化値の両方（保存形式のゆれを吸収） */
export function organizationIdQueryKeys(raw: string): string[] {
  const t = (raw ?? "").trim();
  if (!t) return [];
  const safe = sanitizeOrganizationIdForPath(t);
  const keys = new Set<string>([t]);
  if (safe) keys.add(safe);
  return [...keys];
}

export async function countUsersInOrganization(db: Firestore, organizationId: string): Promise<number> {
  const keys = organizationIdQueryKeys(organizationId);
  if (!keys.length) return 0;
  const seen = new Set<string>();
  for (const key of keys) {
    const snap = await db.collection("users").where("organizationId", "==", key).get();
    for (const d of snap.docs) seen.add(d.id);
  }
  return seen.size;
}

function isProtectedOrganizationId(organizationId: string): boolean {
  const safe = sanitizeOrganizationIdForPath(organizationId) || organizationId.trim();
  return !safe || safe === defaultOrganizationId();
}

async function deleteAllDocumentsInCollection(col: CollectionReference): Promise<number> {
  const db = col.firestore;
  let total = 0;
  while (true) {
    const snap = await col.limit(CHUNK).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
      total++;
    }
    await batch.commit();
  }
  return total;
}

/** organizations/{orgId} のサブコレクションを空にして親ドキュメントを削除 */
export async function deleteOrganizationFirestoreTenant(
  db: Firestore,
  organizationId: string,
): Promise<{ deleted: boolean; subcollectionsDeleted: Record<string, number> }> {
  const safe = sanitizeOrganizationIdForPath(organizationId) || organizationId.trim();
  if (!safe) return { deleted: false, subcollectionsDeleted: {} };
  const orgRef = db.collection("organizations").doc(safe);
  const snap = await orgRef.get();
  if (!snap.exists) return { deleted: false, subcollectionsDeleted: {} };

  const subcollectionsDeleted: Record<string, number> = {};
  for (const col of await orgRef.listCollections()) {
    subcollectionsDeleted[col.id] = await deleteAllDocumentsInCollection(col);
  }
  await orgRef.delete();
  return { deleted: true, subcollectionsDeleted };
}

export type RemoveOrganizationIfUnreferencedResult = {
  organizationId: string;
  removed: boolean;
  firestoreDeleted: boolean;
  diskRemoved: boolean;
  subcollectionsDeleted: Record<string, number>;
  reason?: "protected" | "has_users";
};

/**
 * 当該 organizationId を参照するユーザーが 0 人なら、Firestore organizations と data/orgs を削除。
 */
export async function removeOrganizationIfUnreferenced(
  organizationId: string,
): Promise<RemoveOrganizationIfUnreferencedResult> {
  const safe = sanitizeOrganizationIdForPath(organizationId) || organizationId.trim();
  const base: RemoveOrganizationIfUnreferencedResult = {
    organizationId: safe,
    removed: false,
    firestoreDeleted: false,
    diskRemoved: false,
    subcollectionsDeleted: {},
  };
  if (isProtectedOrganizationId(safe)) {
    return { ...base, reason: "protected" };
  }

  const db = getAdminFirestore();
  const userCount = await countUsersInOrganization(db, safe);
  if (userCount > 0) {
    return { ...base, reason: "has_users" };
  }

  const orgDel = await deleteOrganizationFirestoreTenant(db, safe);
  let diskRemoved = false;
  try {
    diskRemoved = await removeOrganizationDataDir(safe);
  } catch (e) {
    console.warn("[org-tenant-lifecycle] disk remove failed", { organizationId: safe, e });
  }

  return {
    organizationId: safe,
    removed: orgDel.deleted || diskRemoved,
    firestoreDeleted: orgDel.deleted,
    diskRemoved,
    subcollectionsDeleted: orgDel.subcollectionsDeleted,
  };
}

export type CleanupOrphanTenantsResult = {
  scannedIds: string[];
  deletedIds: string[];
  skippedProtected: string[];
  skippedHasUsers: string[];
  details: RemoveOrganizationIfUnreferencedResult[];
};

/** users に紐づかない organizations / data/orgs を一括削除（default は保護） */
export async function cleanupOrphanTenants(): Promise<CleanupOrphanTenantsResult> {
  const [fromFs, fromDisk] = await Promise.all([
    listOrganizationIdsFromFirestore(),
    listOrganizationIdsOnDisk(),
  ]);
  const scannedIds = [...new Set([...fromFs, ...fromDisk])].sort((a, b) => a.localeCompare(b, "ja"));

  const deletedIds: string[] = [];
  const skippedProtected: string[] = [];
  const skippedHasUsers: string[] = [];
  const details: RemoveOrganizationIfUnreferencedResult[] = [];

  for (const id of scannedIds) {
    const result = await removeOrganizationIfUnreferenced(id);
    details.push(result);
    if (result.reason === "protected") {
      skippedProtected.push(id);
    } else if (result.reason === "has_users") {
      skippedHasUsers.push(id);
    } else if (result.removed) {
      deletedIds.push(result.organizationId);
    }
  }

  return { scannedIds, deletedIds, skippedProtected, skippedHasUsers, details };
}

export type AssignUserOrganizationResult = {
  targetUid: string;
  previousOrganizationId: string | null;
  organizationId: string;
  removedPreviousTenant: RemoveOrganizationIfUnreferencedResult | null;
};

/**
 * 管理者: ユーザーの organizationId を変更し、旧テナントが参照 0 なら削除。新テナントを bootstrap。
 */
export async function assignUserOrganizationId(params: {
  targetUid: string;
  organizationId: string;
}): Promise<AssignUserOrganizationResult> {
  const targetUid = params.targetUid.trim();
  const sanitized = sanitizeOrganizationIdForPath(params.organizationId.trim());
  if (!targetUid) throw new Error("対象 UID が空です。");
  if (!sanitized) {
    throw new Error(
      "organizationId をディレクトリ名に使えません。英数字・ハイフン・アンダースコアのみにしてください。",
    );
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(targetUid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new Error("users ドキュメントが見つかりません。");
  }

  const prevRaw = snap.get("organizationId");
  const previousOrganizationId =
    prevRaw === undefined || prevRaw === null ? null : String(prevRaw).trim() || null;

  await userRef.set({ organizationId: sanitized }, { merge: true });
  await ensureOrganizationDataDir(sanitized);
  await db
    .collection("organizations")
    .doc(sanitized)
    .set({ updatedAt: new Date().toISOString() }, { merge: true });

  let removedPreviousTenant: RemoveOrganizationIfUnreferencedResult | null = null;
  if (previousOrganizationId) {
    const prevSafe = sanitizeOrganizationIdForPath(previousOrganizationId) || previousOrganizationId;
    if (prevSafe !== sanitized) {
      removedPreviousTenant = await removeOrganizationIfUnreferenced(previousOrganizationId);
    }
  }

  return {
    targetUid,
    previousOrganizationId,
    organizationId: sanitized,
    removedPreviousTenant,
  };
}
