import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-04-22.dahlia" as const;

export function createStripeClient(secretKey: string) {
  const key = secretKey.trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export type StripeClient = NonNullable<ReturnType<typeof createStripeClient>>;
