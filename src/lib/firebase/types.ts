import type { Timestamp } from "firebase/firestore";

import type { NexusProductId } from "@/lib/constants/nexus-products";

/** users/{uid} に保存する想定のフィールド（クライアントは主に読み取り） */
export type FirestoreUserProfile = {
  roles?: string[];
  organizationId?: string | null;
  /** Stripe 等。初期は {}。更新はサーバー（Webhook）のみ想定 */
  billing?: Record<string, unknown>;
  /** Functions のウェルカムメール送信済み（任意） */
  welcomeEmailSentAt?: Timestamp | null;
};

/** users/{uid}/entitlements/{productId} */
export type EntitlementDoc = {
  status: "none" | "active";
  source?: string | null;
  expiresAt?: Timestamp | null;
  organizationId?: string | null;
};

export type EntitlementPathParams = {
  uid: string;
  productId: NexusProductId;
};
