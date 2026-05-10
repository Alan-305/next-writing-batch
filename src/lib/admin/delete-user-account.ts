import type { CollectionReference, DocumentSnapshot, Firestore } from "firebase-admin/firestore";

import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";

const CHUNK = 400;

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
      if (s) orgIds.add(sanitizeOrganizationIdForPath(s) || s);
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

  return {
    ok: true,
    targetUid,
    deletedSubmissionDocs,
    subcollectionsDeleted,
    userDocumentExisted,
    authUserExisted,
    authUserDeleted,
  };
}
