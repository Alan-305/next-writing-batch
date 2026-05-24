import { getFirebaseAuth } from "@/lib/firebase/client";

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

type ApiJson = AdminAdjustBillingTicketsResult & {
  message?: string;
  code?: string;
};

/**
 * 管理者チケット手動増減。Next.js API（Admin SDK）経由。
 * allowlist（NEXT_PUBLIC_FIREBASE_ADMIN_UIDS）に載っている UID なら dev / 本番どちらでも実行可。
 */
export async function adminAdjustBillingTickets(
  input: AdminAdjustBillingTicketsInput,
): Promise<AdminAdjustBillingTicketsResult> {
  const u = getFirebaseAuth()?.currentUser;
  if (!u) {
    throw new Error("ログインが必要です。");
  }
  const token = await u.getIdToken();
  const res = await fetch("/api/admin/adjust-billing-tickets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as ApiJson;
  if (!res.ok || data.ok !== true) {
    throw new Error(data.message ?? "チケット調整に失敗しました。");
  }
  return data;
}
