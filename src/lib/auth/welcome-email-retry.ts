import { getFirebaseAuth } from "@/lib/firebase/client";

import type { WelcomeEmailSendResult } from "@/lib/auth/welcome-email-server";

export type WelcomeEmailRetryResult = {
  ok: boolean;
  status?: WelcomeEmailSendResult["status"];
  reason?: string;
  skipped?: "already_sent";
  sent?: boolean;
};

/**
 * ログイン後のウェルカムメール再試行（Next.js API 経由）。
 * Cloud Functions の Callable より Cloud Run の RESEND_API_KEY を優先して使う。
 */
export async function callWelcomeEmailRetry(): Promise<WelcomeEmailRetryResult> {
  const auth = getFirebaseAuth();
  const u = auth?.currentUser;
  if (!u) {
    return { ok: false };
  }
  const token = await u.getIdToken();
  const res = await fetch("/api/user/welcome-email", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await res.json()) as WelcomeEmailRetryResult & {
    status?: WelcomeEmailSendResult["status"];
    reason?: string;
  };
  if (!res.ok || !j?.ok) {
    return { ok: false };
  }
  if (j.status === "sent") {
    return { ok: true, sent: true, status: "sent" };
  }
  if (j.status === "skipped" && j.reason === "already_sent") {
    return { ok: true, skipped: "already_sent", status: "skipped", reason: j.reason };
  }
  return { ok: true, sent: false, status: j.status, reason: j.reason };
}
