import { FieldValue } from "firebase-admin/firestore";

import {
  applyBillingLots,
  extendActiveTicketLotExpiry,
  nearestTicketExpiryIso,
  resolveBillingTicketLots,
  sumTicketLots,
} from "@/lib/billing/ticket-lots";
import { PRODUCT_ID_NEXT_WRITING_BATCH } from "@/lib/constants/nexus-products";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export type AdminAdjustTicketExpiryInput = {
  targetUserId: string;
  extendDays: number;
  reason?: string;
  idempotencyKey?: string;
};

export type AdminAdjustTicketExpiryResult = {
  ok: true;
  targetUserId: string;
  tickets: number;
  extendDays: number;
  ticketExpiresAt: string | null;
};

export class AdminAdjustTicketExpiryError extends Error {
  readonly code: "INVALID_ARGUMENT" | "NOT_FOUND" | "FAILED";

  constructor(code: AdminAdjustTicketExpiryError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AdminAdjustTicketExpiryError";
  }
}

/**
 * 管理者によるチケット有効期限の手動調整（有効ロットの expiresAt を日数分シフト）。
 */
export async function executeAdminAdjustTicketExpiry(
  callerUid: string,
  input: AdminAdjustTicketExpiryInput,
): Promise<AdminAdjustTicketExpiryResult> {
  const targetUserId = (input.targetUserId ?? "").trim();
  if (!targetUserId) {
    throw new AdminAdjustTicketExpiryError("INVALID_ARGUMENT", "targetUserId を指定してください。");
  }

  const extendDays = Number(input.extendDays);
  if (!Number.isFinite(extendDays) || !Number.isInteger(extendDays) || extendDays === 0) {
    throw new AdminAdjustTicketExpiryError(
      "INVALID_ARGUMENT",
      "extendDays は 0 以外の整数で指定してください。",
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim().slice(0, 200) : "";

  const db = getAdminFirestore();
  const idemRef = idempotencyKey ? db.collection("admin_billing_adjustments").doc(idempotencyKey) : null;
  const userRef = db.collection("users").doc(targetUserId);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  let nextTickets = 0;
  let nextExpiry: string | null = null;

  await db.runTransaction(async (tx) => {
    if (idemRef) {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        nextTickets = typeof idemSnap.get("resultTickets") === "number" ? idemSnap.get("resultTickets") : 0;
        const storedExpiry = idemSnap.get("resultTicketExpiresAt");
        nextExpiry = typeof storedExpiry === "string" && storedExpiry.trim() ? storedExpiry.trim() : null;
        return;
      }
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new AdminAdjustTicketExpiryError(
        "NOT_FOUND",
        "対象ユーザーのドキュメントが存在しません。",
      );
    }

    const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
    const { lots } = resolveBillingTicketLots(existingBilling);
    const nextLots = extendActiveTicketLotExpiry(lots, extendDays);
    nextTickets = sumTicketLots(nextLots);
    nextExpiry = nextTickets > 0 ? nearestTicketExpiryIso(nextLots) : null;

    tx.update(userRef, {
      billing: applyBillingLots(
        {
          ...existingBilling,
          lastManualExpiryExtendDays: extendDays,
          lastManualExpiryReason: reason || null,
          lastManualExpiryByUid: callerUid.trim(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        nextLots,
      ),
    });

    tx.set(
      entRef,
      {
        status: nextTickets > 0 ? ("active" as const) : ("none" as const),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (idemRef) {
      tx.set(idemRef, {
        targetUserId,
        extendDays,
        reason: reason || null,
        adminUid: callerUid.trim(),
        resultTickets: nextTickets,
        resultTicketExpiresAt: nextExpiry,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return {
    ok: true,
    targetUserId,
    tickets: nextTickets,
    extendDays,
    ticketExpiresAt: nextExpiry,
  };
}
