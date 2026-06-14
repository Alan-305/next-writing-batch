import type { BillingPlan } from "@/lib/billing/create-checkout-session";

/** 画面表示・特定商取引法表記と Stripe プランの共通定義 */
export const TICKET_BILLING_PLANS: Array<{
  plan: BillingPlan;
  label: string;
  priceLabel: string;
  priceYen: number;
  tickets: number;
  validityDays: number;
}> = [
  { plan: "t10", label: "10枚パック", priceLabel: "4,000円", priceYen: 4000, tickets: 10, validityDays: 60 },
  { plan: "t30", label: "30枚パック", priceLabel: "10,000円", priceYen: 10000, tickets: 30, validityDays: 120 },
  { plan: "t60", label: "60枚パック", priceLabel: "18,000円", priceYen: 18000, tickets: 60, validityDays: 180 },
  { plan: "t120", label: "120枚パック", priceLabel: "30,000円", priceYen: 30000, tickets: 120, validityDays: 360 },
];

export const VALIDITY_DAYS_BY_PLAN: Record<BillingPlan, number> = {
  t10: 60,
  t30: 120,
  t60: 180,
  t120: 360,
};

/** 初回登録特典（5枚）の有効期限 */
export const WELCOME_FREE_TICKET_VALIDITY_DAYS = 30;

export function validityDaysForPlan(plan: BillingPlan): number {
  return VALIDITY_DAYS_BY_PLAN[plan];
}

export function validityLabel(days: number): string {
  return `${days}日`;
}
