import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { defaultOrganizationId, sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";

let db: Firestore | undefined;

export function getAdminFirestore(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseAdminApp());
  return db;
}

export type OrganizationIdResolution = {
  /** `data/orgs/{id}/` に使う解決後 ID */
  resolvedOrganizationId: string;
  /** Firestore に入っている生の値（無い・null のときは null） */
  firestoreRaw: string | null;
  /** 未設定・空・正規化後に空でフォールバックしたか */
  usedFallback: boolean;
  /** 環境変数 `DEFAULT_ORGANIZATION_ID` 由来の既定（未設定時のディレクトリ名） */
  fallbackOrganizationId: string;
};

/**
 * Firestore `users/{uid}.organizationId` の解決結果（テナント検証 UI 用）。
 * 未設定・読み取り失敗時は `DEFAULT_ORGANIZATION_ID`（既定 `default`）。
 */
export async function describeOrganizationIdForUid(uid: string): Promise<OrganizationIdResolution> {
  const fallbackOrg = defaultOrganizationId();
  if (!uid.trim()) {
    return {
      resolvedOrganizationId: fallbackOrg,
      firestoreRaw: null,
      usedFallback: true,
      fallbackOrganizationId: fallbackOrg,
    };
  }
  try {
    const snap = await getAdminFirestore().collection("users").doc(uid).get();
    if (!snap.exists) {
      return {
        resolvedOrganizationId: fallbackOrg,
        firestoreRaw: null,
        usedFallback: true,
        fallbackOrganizationId: fallbackOrg,
      };
    }
    const raw = snap.get("organizationId");
    if (raw === undefined || raw === null) {
      return {
        resolvedOrganizationId: fallbackOrg,
        firestoreRaw: null,
        usedFallback: true,
        fallbackOrganizationId: fallbackOrg,
      };
    }
    const rawStr = String(raw).trim();
    const sanitized = sanitizeOrganizationIdForPath(rawStr);
    const resolved = sanitized || fallbackOrg;
    const usedFallback = !sanitized;
    return {
      resolvedOrganizationId: resolved,
      firestoreRaw: rawStr.length ? rawStr : null,
      usedFallback,
      fallbackOrganizationId: fallbackOrg,
    };
  } catch (e) {
    console.warn("[describeOrganizationIdForUid] Firestore read failed, using fallback org", e);
    return {
      resolvedOrganizationId: fallbackOrg,
      firestoreRaw: null,
      usedFallback: true,
      fallbackOrganizationId: fallbackOrg,
    };
  }
}

/**
 * Firestore `users/{uid}` の `organizationId` を読み、ディレクトリ用に正規化する。
 * 未設定・読み取り失敗時は `DEFAULT_ORGANIZATION_ID`（既定 `default`）。
 */
export async function resolveOrganizationIdForUid(uid: string): Promise<string> {
  const d = await describeOrganizationIdForUid(uid);
  return d.resolvedOrganizationId;
}
