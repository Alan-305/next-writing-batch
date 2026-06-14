import { FieldValue } from "firebase-admin/firestore";

import {
  applyBillingLots,
  consumeTicketLots,
  deductPaidTicketLots,
  grantTicketLot,
  resolveBillingTicketLots,
  sumTicketLots,
} from "@/lib/billing/ticket-lots";
import { VALIDITY_DAYS_BY_PLAN } from "@/lib/legal/ticket-billing-plans";
import { PRODUCT_ID_NEXT_WRITING_BATCH } from "@/lib/constants/nexus-products";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export type AdminAdjustBillingTicketsInput = {
  targetUserId: string;
  deltaTickets: number;
  reason?: string;
  idempotencyKey?: string;
};

export type AdminAdjustBillingTicketsResult = {
  ok: true;
  targetUserId: string;
  tickets: number;
  deltaTickets: number;
};

export class AdminAdjustBillingTicketsError extends Error {
  readonly code: "INVALID_ARGUMENT" | "NOT_FOUND" | "FAILED";

  constructor(code: AdminAdjustBillingTicketsError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AdminAdjustBillingTicketsError";
  }
}

/**
 * 管理者によるチケット手動増減（Cloud Functions adminAdjustBillingTickets と同等）。
 * Next.js API から Admin SDK で実行し、allowlist 管理者なら dev / Cloud Run どちらでも動く。
 */
export async function executeAdminAdjustBillingTickets(
  callerUid: string,
  input: AdminAdjustBillingTicketsInput,
): Promise<AdminAdjustBillingTicketsResult> {
  const targetUserId = (input.targetUserId ?? "").trim();
  if (!targetUserId) {
    throw new AdminAdjustBillingTicketsError("INVALID_ARGUMENT", "targetUserId を指定してください。");
  }

  const deltaTickets = Number(input.deltaTickets);
  if (!Number.isFinite(deltaTickets) || !Number.isInteger(deltaTickets)) {
    throw new AdminAdjustBillingTicketsError("INVALID_ARGUMENT", "deltaTickets は整数で指定してください。");
  }

  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "";
  const idempotencyKey =
    typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim().slice(0, 200) : "";

  const db = getAdminFirestore();
  const idemRef = idempotencyKey ? db.collection("admin_billing_adjustments").doc(idempotencyKey) : null;
  const userRef = db.collection("users").doc(targetUserId);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  let nextTickets = 0;

  await db.runTransaction(async (tx) => {
    if (idemRef) {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        nextTickets = typeof idemSnap.get("resultTickets") === "number" ? idemSnap.get("resultTickets") : 0;
        return;
      }
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new AdminAdjustBillingTicketsError(
        "NOT_FOUND",
        "対象ユーザーのドキュメントが存在しません。",
      );
    }

    const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
    const { lots } = resolveBillingTicketLots(existingBilling);
    let nextLots = lots;

    if (deltaTickets > 0) {
      nextLots = grantTicketLot(nextLots, {
        count: deltaTickets,
        validityDays: VALIDITY_DAYS_BY_PLAN.t120,
        kind: "manual",
      });
    } else if (deltaTickets < 0) {
      const { lots: deductedLots, deducted } = deductPaidTicketLots(nextLots, Math.abs(deltaTickets));
      if (deducted < Math.abs(deltaTickets)) {
        const { lots: consumedLots, consumed } = consumeTicketLots(deductedLots, Math.abs(deltaTickets) - deducted);
        nextLots = consumedLots;
      } else {
        nextLots = deductedLots;
      }
    }

    nextTickets = sumTicketLots(nextLots);

    tx.update(userRef, {
      billing: applyBillingLots(
        {
          ...existingBilling,
          lastManualTicketDelta: deltaTickets,
          lastManualTicketReason: reason || null,
          lastManualTicketByUid: callerUid.trim(),
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
        deltaTickets,
        reason: reason || null,
        adminUid: callerUid.trim(),
        resultTickets: nextTickets,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, targetUserId, tickets: nextTickets, deltaTickets };
}
