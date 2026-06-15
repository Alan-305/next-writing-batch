import { getFirebaseAuth } from "@/lib/firebase/client";

export type AdminAdjustTicketExpiryInput = {
  targetUserId: string;
  extendDays: number;
  reason?: string;
  idempotencyKey?: string;
};

export type AdminAdjustTicketExpiryResult = {
  ok: boolean;
  targetUserId: string;
  tickets: number;
  extendDays: number;
  ticketExpiresAt: string | null;
};

type ApiJson = AdminAdjustTicketExpiryResult & {
  message?: string;
  code?: string;
};

export async function adminAdjustTicketExpiry(
  input: AdminAdjustTicketExpiryInput,
): Promise<AdminAdjustTicketExpiryResult> {
  const u = getFirebaseAuth()?.currentUser;
  if (!u) {
    throw new Error("ログインが必要です。");
  }
  const token = await u.getIdToken();
  const res = await fetch("/api/admin/adjust-ticket-expiry", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as ApiJson;
  if (!res.ok || data.ok !== true) {
    throw new Error(data.message ?? "有効期限の調整に失敗しました。");
  }
  return data;
}
