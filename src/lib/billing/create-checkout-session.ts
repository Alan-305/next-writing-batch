import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "@/lib/firebase/client";

/** Stripe Price と対応（10 / 30 / 60 / 120 枚パック） */
export type BillingPlan = "t10" | "t30" | "t60" | "t120";

type CreateStripeCheckoutSessionInput = {
  plan: BillingPlan;
  successUrl: string;
  cancelUrl: string;
};

type CreateStripeCheckoutSessionOutput = {
  sessionId: string;
  url: string | null;
};

export async function createStripeCheckoutSession(
  input: CreateStripeCheckoutSessionInput,
): Promise<CreateStripeCheckoutSessionOutput> {
  const fns = getFirebaseFunctions();
  if (!fns) {
    throw new Error("Firebase Functions が初期化されていません。");
  }
  const call = httpsCallable<CreateStripeCheckoutSessionInput, CreateStripeCheckoutSessionOutput>(
    fns,
    "createStripeCheckoutSession",
  );
  const result = await call(input);
  return result.data;
}
