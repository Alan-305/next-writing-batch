import type { Timestamp } from "firebase/firestore";

import type { NexusProductId } from "@/lib/constants/nexus-products";

/** users/{uid} に保存する想定のフィールド（クライアントは主に読み取り） */
export type BillingInfo = {
  status?: "none" | "active";
  tickets?: number;
  stripeCustomerId?: string | null;
  lastCheckoutSessionId?: string | null;
  /** checkout.session.completed 時に Webhook から保存（管理画面の返金用） */
  lastPaymentIntentId?: string | null;
  lastTicketAdded?: number;
  /** charge.refunded 連携（任意） */
  lastRefundChargeId?: string | null;
  lastRefundTicketsDeducted?: number;
  lastRefundAmountDelta?: number;
  /** adminAdjustBillingTickets（任意） */
  lastManualTicketDelta?: number;
  lastManualTicketReason?: string | null;
  lastManualTicketByUid?: string | null;
  /** 添削 API 成功後のチケット消費（任意） */
  lastProofreadTicketConsume?: number;
  lastProofreadTicketAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

/** users/{uid} に保存する想定のフィールド（クライアントは主に読み取り） */
export type FirestoreUserProfile = {
  roles?: string[];
  organizationId?: string | null;
  /** 生徒の学籍番号（教員には通常未設定） */
  studentNumber?: string | null;
  /** 表示名・ニックネーム（生徒は必須、教員は任意） */
  nickname?: string | null;
  /** 生徒プロフィール初回登録完了（サーバーが設定） */
  studentProfileCompletedAt?: Timestamp | null;
  /** Stripe 等。初期は {}。更新はサーバー（Webhook）のみ想定 */
  billing?: BillingInfo;
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
