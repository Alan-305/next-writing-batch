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

export async function getTicketBalanceForOrganization(organizationId: string): Promise<number> {
  const oid = (organizationId ?? "").trim();
  if (!oid) return 0;
  const db = getAdminFirestore();
  const snap = await db.collection("users").where("organizationId", "==", oid).get();
  let total = 0;
  for (const doc of snap.docs) {
    const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
    const t = billing["tickets"];
    if (typeof t === "number" && Number.isFinite(t)) total += Math.max(0, Math.floor(t));
  }
  return total;
}

type OrgConsumeResult =
  | { ok: true; remainingTotal: number; consumedTotal: number; consumedFrom: Array<{ uid: string; amount: number }> }
  | { ok: false; code: "INSUFFICIENT" | "NO_MEMBER" };

/**
 * 同一 organizationId のユーザー全体を共有プールとして減算する。
 * まず preferredUid を優先し、足りない分を同一テナントの他ユーザーから順に減算する。
 */
export async function consumeProofreadTicketsFromOrganization(
  organizationId: string,
  count: number,
  preferredUid?: string,
): Promise<OrgConsumeResult> {
  const oid = (organizationId ?? "").trim();
  const c = Math.floor(Number(count));
  const preferred = (preferredUid ?? "").trim();
  if (!oid || !Number.isFinite(c) || c <= 0) {
    return { ok: true, remainingTotal: 0, consumedTotal: 0, consumedFrom: [] };
  }

  const db = getAdminFirestore();
  const userSnap = await db.collection("users").where("organizationId", "==", oid).get();
  if (userSnap.empty) return { ok: false, code: "NO_MEMBER" };

  type Row = { uid: string; current: number; billing: Record<string, unknown> };
  const rows: Row[] = userSnap.docs.map((doc) => {
    const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
    const t = billing["tickets"];
    const current = typeof t === "number" && Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
    return { uid: doc.id, current, billing };
  });

  const total = rows.reduce((acc, r) => acc + r.current, 0);
  if (total < c) return { ok: false, code: "INSUFFICIENT" };

  const prioritized = [...rows].sort((a, b) => {
    if (a.uid === preferred && b.uid !== preferred) return -1;
    if (b.uid === preferred && a.uid !== preferred) return 1;
    return b.current - a.current;
  });

  const consumePlan: Array<{ uid: string; amount: number }> = [];
  let remain = c;
  for (const r of prioritized) {
    if (remain <= 0) break;
    if (r.current <= 0) continue;
    const take = Math.min(r.current, remain);
    if (take > 0) {
      consumePlan.push({ uid: r.uid, amount: take });
      remain -= take;
    }
  }
  if (remain > 0) return { ok: false, code: "INSUFFICIENT" };

  await db.runTransaction(async (tx) => {
    for (const p of consumePlan) {
      const ref = db.collection("users").doc(p.uid);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("NO_MEMBER");
      const existingBilling = (snap.get("billing") ?? {}) as Record<string, unknown>;
      const current =
        typeof existingBilling["tickets"] === "number" ? (existingBilling["tickets"] as number) : 0;
      if (current < p.amount) throw new Error("INSUFFICIENT");
      const next = Math.max(0, current - p.amount);
      tx.update(ref, {
        billing: {
          ...existingBilling,
          tickets: next,
          lastProofreadTicketConsume: p.amount,
          lastProofreadTicketAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      });
      tx.set(
        ref.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH),
        {
          status: next > 0 ? ("active" as const) : ("none" as const),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  return {
    ok: true,
    remainingTotal: total - c,
    consumedTotal: c,
    consumedFrom: consumePlan,
  };
}
