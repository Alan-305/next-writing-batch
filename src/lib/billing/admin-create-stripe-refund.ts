import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "@/lib/firebase/client";

export type AdminCreateStripeRefundInput = {
  /** 購入時の Firebase Auth uid（PaymentIntent metadata.uid と一致必須） */
  expectedUid: string;
  paymentIntentId?: string;
  chargeId?: string;
  /** Checkout Session ID（cs_…）。Firestore の lastCheckoutSessionId など。 */
  checkoutSessionId?: string;
  /** 部分返金の場合のみ。JPY なら円の整数。未指定で全額。 */
  amount?: number;
  note?: string;
  idempotencyKey?: string;
};

export type AdminCreateStripeRefundResult = {
  ok: true;
  refundId: string;
  status: string | null;
  amount: number | null;
  currency: string | null;
  paymentIntentId: string;
};

export async function adminCreateStripeRefund(
  input: AdminCreateStripeRefundInput,
): Promise<AdminCreateStripeRefundResult> {
  const fns = getFirebaseFunctions();
  if (!fns) {
    throw new Error("Firebase Functions が初期化されていません。");
  }
  const call = httpsCallable<AdminCreateStripeRefundInput, AdminCreateStripeRefundResult>(
    fns,
    "adminCreateStripeRefund",
  );
  const result = await call(input);
  return result.data;
}
