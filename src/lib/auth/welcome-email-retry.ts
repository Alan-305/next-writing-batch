import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "@/lib/firebase/client";

export type WelcomeEmailRetryResult = {
  ok: boolean;
  skipped?: "already_sent";
  sent?: boolean;
  reason?: "skipped_or_resend_failed";
};

/**
 * Functions の callable `welcomeEmailRetry`。
 * onCreate で RESEND が未設定でも、後から Functions にキーを載せたあと自動再試行に使える。
 */
export async function callWelcomeEmailRetry(): Promise<WelcomeEmailRetryResult> {
  const fns = getFirebaseFunctions();
  if (!fns) {
    throw new Error("Firebase Functions が初期化されていません。");
  }
  const call = httpsCallable<Record<string, never>, WelcomeEmailRetryResult>(fns, "welcomeEmailRetry");
  const out = await call({});
  const data = out.data;
  if (!data?.ok) {
    return { ok: false };
  }
  return data;
}
