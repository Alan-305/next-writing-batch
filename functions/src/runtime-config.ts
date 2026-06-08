import { defineSecret, defineString } from "firebase-functions/params";

/** Secret Manager に登録済みの値をデプロイ時に関数へバインドする */
export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
export const resendApiKey = defineSecret("RESEND_API_KEY");

export const stripePriceT10 = defineString("STRIPE_PRICE_T10");
export const stripePriceT30 = defineString("STRIPE_PRICE_T30");
export const stripePriceT60 = defineString("STRIPE_PRICE_T60");
export const stripePriceT120 = defineString("STRIPE_PRICE_T120");

export type BillingPlan = "t10" | "t30" | "t60" | "t120";

export const TICKETS_BY_PLAN: Record<BillingPlan, number> = {
  t10: 10,
  t30: 30,
  t60: 60,
  t120: 120,
};

export function stripePriceByPlan(): Record<BillingPlan, string> {
  return {
    t10: stripePriceT10.value().trim(),
    t30: stripePriceT30.value().trim(),
    t60: stripePriceT60.value().trim(),
    t120: stripePriceT120.value().trim(),
  };
}

export function lookupTicketsByPriceId(priceId: string): number {
  const table = stripePriceByPlan();
  const byPlan: Record<string, number> = {
    [table.t10]: TICKETS_BY_PLAN.t10,
    [table.t30]: TICKETS_BY_PLAN.t30,
    [table.t60]: TICKETS_BY_PLAN.t60,
    [table.t120]: TICKETS_BY_PLAN.t120,
  };
  return byPlan[priceId] ?? 0;
}
