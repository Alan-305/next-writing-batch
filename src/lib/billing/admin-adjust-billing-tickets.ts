import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "@/lib/firebase/client";

export type AdminAdjustBillingTicketsInput = {
  targetUserId: string;
  deltaTickets: number;
  reason?: string;
  idempotencyKey?: string;
};

export type AdminAdjustBillingTicketsResult = {
  ok: boolean;
  targetUserId: string;
  tickets: number;
  deltaTickets: number;
};

export async function adminAdjustBillingTickets(
  input: AdminAdjustBillingTicketsInput,
): Promise<AdminAdjustBillingTicketsResult> {
  const fns = getFirebaseFunctions();
  if (!fns) {
    throw new Error("Firebase Functions が初期化されていません。");
  }
  const call = httpsCallable<AdminAdjustBillingTicketsInput, AdminAdjustBillingTicketsResult>(
    fns,
    "adminAdjustBillingTickets",
  );
  const result = await call(input);
  return result.data;
}
