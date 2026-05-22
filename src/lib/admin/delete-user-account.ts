import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";

import { organizationIdQueryKeys, removeOrganizationIfUnreferenced } from "@/lib/org-tenant-lifecycle";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";

const CHUNK = 400;

async function deleteAllDocumentsInCollection(
  col: import("firebase-admin/firestore").CollectionReference,
): Promise<number> {
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

/** 単一テナントの submissions で submittedByUid が一致するものだけ削除（サブコレクション単位のため追加インデックス不要）。 */
async function deleteSubmissionsInOrg(db: Firestore, organizationId: string, uid: string): Promise<number> {
  const col = db.collection("organizations").doc(organizationId).collection("submissions");
  let total = 0;
  while (true) {
    const snap = await col.where("submittedByUid", "==", uid).limit(CHUNK).get();
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

/**
 * 提出は organizations/{orgId}/submissions にのみ存在する前提で org を列挙して削除する。
 * organizations 親ドキュメントが無いテナントは users の organizationId・DEFAULT_ORGANIZATION_ID で補完。
 */
async function deleteSubmissionsForUid(uid: string, userSnap: DocumentSnapshot): Promise<number> {
  const db = getAdminFirestore();
  const orgIds = new Set<string>();

  const orgRoot = await db.collection("organizations").get();
  for (const d of orgRoot.docs) orgIds.add(d.id);

  if (userSnap.exists) {
    const raw = userSnap.get("organizationId");
    if (raw !== undefined && raw !== null) {
      const s = String(raw).trim();
      for (const key of organizationIdQueryKeys(s)) {
        orgIds.add(sanitizeOrganizationIdForPath(key) || key);
      }
    }
  }

  orgIds.add(defaultOrganizationId());

  let total = 0;
  for (const oid of orgIds) {
    total += await deleteSubmissionsInOrg(db, oid, uid);
  }
  return total;
}

export type UserAccountDeletionResult = {
  ok: true;
  targetUid: string;
  deletedSubmissionDocs: number;
  /** users/{uid} 直下サブコレクションごとの削除ドキュメント数 */
  subcollectionsDeleted: Record<string, number>;
  userDocumentExisted: boolean;
  authUserExisted: boolean;
  authUserDeleted: boolean;
  /** 削除後に参照ユーザーが 0 人になった organizationId */
  deletedOrganizationId: string | null;
  organizationTenantDeleted: boolean;
  organizationSubcollectionsDeleted: Record<string, number>;
  organizationDiskRemoved: boolean;
};

export class UserAccountDeletionError extends Error {
  constructor(
    message: string,
    public readonly code: "SELF_DELETE" | "INVALID_UID" | "CONFIRM_MISMATCH",
  ) {
    super(message);
    this.name = "UserAccountDeletionError";
  }
}

/**
 * 管理者専用: 対象ユーザーの Firestore データ・提出・Firebase Auth を削除する。
 * 削除後、当該 organizationId を参照するユーザーがいなければテナント（organizations・data/orgs）も削除する。
 * GCS の Day4 オブジェクトや Stripe 顧客は削除しない（必要なら別途運用）。
 */
export async function executeAdminUserAccountDeletion(params: {
  actorUid: string;
  targetUid: string;
  confirmTargetUid: string;
}): Promise<UserAccountDeletionResult> {
  const targetUid = params.targetUid.trim();
  const confirm = params.confirmTargetUid.trim();
  if (!targetUid) {
    throw new UserAccountDeletionError("対象 UID が空です。", "INVALID_UID");
  }
  if (targetUid !== confirm) {
    throw new UserAccountDeletionError("確認用 UID が一致しません。", "CONFIRM_MISMATCH");
  }
  if (targetUid === params.actorUid.trim()) {
    throw new UserAccountDeletionError("自分自身のアカウントは削除できません。", "SELF_DELETE");
  }

  const db = getAdminFirestore();
  const auth = getAdminAuth();

  let authUserExisted = false;
  try {
    await auth.getUser(targetUid);
    authUserExisted = true;
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
    if (code !== "auth/user-not-found") {
      throw e;
    }
  }

  const userRef = db.collection("users").doc(targetUid);
  const userSnapEarly = await userRef.get();
  const rawOrg = userSnapEarly.exists ? String(userSnapEarly.get("organizationId") ?? "").trim() : "";
  const orgIdsToReconcile = rawOrg ? organizationIdQueryKeys(rawOrg) : [];

  const deletedSubmissionDocs = await deleteSubmissionsForUid(targetUid, userSnapEarly);

  const subcollectionsDeleted: Record<string, number> = {};
  const subcols = await userRef.listCollections();
  for (const col of subcols) {
    subcollectionsDeleted[col.id] = await deleteAllDocumentsInCollection(col);
  }

  const userSnap = await userRef.get();
  const userDocumentExisted = userSnap.exists;
  if (userDocumentExisted) {
    await userRef.delete();
  }

  let authUserDeleted = false;
  if (authUserExisted) {
    try {
      await auth.deleteUser(targetUid);
      authUserDeleted = true;
    } catch (e: unknown) {
      const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: string }).code) : "";
      if (code === "auth/user-not-found") {
        authUserDeleted = false;
      } else {
        throw e;
      }
    }
  }

  let organizationTenantDeleted = false;
  let organizationSubcollectionsDeleted: Record<string, number> = {};
  let organizationDiskRemoved = false;
  let deletedOrganizationId: string | null = null;

  const reconciled = new Set<string>();
  for (const key of orgIdsToReconcile) {
    const safe = sanitizeOrganizationIdForPath(key) || key;
    if (!safe || reconciled.has(safe)) continue;
    reconciled.add(safe);
    const removed = await removeOrganizationIfUnreferenced(safe);
    if (removed.removed) {
      organizationTenantDeleted = true;
      deletedOrganizationId = safe;
      organizationSubcollectionsDeleted = removed.subcollectionsDeleted;
      organizationDiskRemoved = removed.diskRemoved;
    }
  }

  return {
    ok: true,
    targetUid,
    deletedSubmissionDocs,
    subcollectionsDeleted,
    userDocumentExisted,
    authUserExisted,
    authUserDeleted,
    deletedOrganizationId,
    organizationTenantDeleted,
    organizationSubcollectionsDeleted,
    organizationDiskRemoved,
  };
}
