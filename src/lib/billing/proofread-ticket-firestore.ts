import { FieldValue } from "firebase-admin/firestore";

import { PRODUCT_ID_NEXT_WRITING_BATCH } from "@/lib/constants/nexus-products";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

/**
 * 添削バッチ成功後にチケットを減算する（憲法: Webhook 以外のサーバー更新はここに限定）。
 */
export async function consumeProofreadTickets(
  uid: string,
  count: number,
): Promise<{ ok: true; tickets: number } | { ok: false; code: "INSUFFICIENT" | "NO_USER" }> {
  const u = (uid ?? "").trim();
  const c = Math.floor(Number(count));
  if (!u || !Number.isFinite(c) || c <= 0) {
    return { ok: true, tickets: 0 };
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(u);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  let resultTickets = 0;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw new Error("NO_USER");
      }
      const existingBilling = (snap.get("billing") ?? {}) as Record<string, unknown>;
      const current =
        typeof existingBilling["tickets"] === "number" ? (existingBilling["tickets"] as number) : 0;
      if (current < c) {
        throw new Error("INSUFFICIENT");
      }
      resultTickets = Math.max(0, current - c);
      tx.update(userRef, {
        billing: {
          ...existingBilling,
          tickets: resultTickets,
          lastProofreadTicketConsume: c,
          lastProofreadTicketAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.set(
        entRef,
        {
          status: resultTickets > 0 ? ("active" as const) : ("none" as const),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "INSUFFICIENT") return { ok: false, code: "INSUFFICIENT" };
    if (msg === "NO_USER") return { ok: false, code: "NO_USER" };
    throw e;
  }

  return { ok: true, tickets: resultTickets };
}

export async function getTicketBalanceForUid(uid: string): Promise<number> {
  const u = (uid ?? "").trim();
  if (!u) return 0;
  const snap = await getAdminFirestore().collection("users").doc(u).get();
  if (!snap.exists) return 0;
  const billing = (snap.get("billing") ?? {}) as Record<string, unknown>;
  const t = billing["tickets"];
  return typeof t === "number" && Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
}
