import { FieldValue } from "firebase-admin/firestore";

import { PRODUCT_ID_NEXT_WRITING_BATCH } from "@/lib/constants/nexus-products";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import type { Submission } from "@/lib/submissions-store";

export type TicketConsumeReason = "day4_finalize" | "legacy_proofread_label";

/**
 * 単一 UID の `billing.tickets` を減算する。
 * Day4 確定時は `day4_finalize` を指定し、証跡フィールドを lastDay4Finalize* に記録する。
 */
export async function consumeProofreadTickets(
  uid: string,
  count: number,
  reason: TicketConsumeReason = "legacy_proofread_label",
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
      const nextBilling =
        reason === "day4_finalize"
          ? {
              ...existingBilling,
              tickets: resultTickets,
              lastDay4FinalizeTicketConsume: c,
              lastDay4FinalizeTicketAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            }
          : {
              ...existingBilling,
              tickets: resultTickets,
              lastProofreadTicketConsume: c,
              lastProofreadTicketAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };
      tx.update(userRef, {
        billing: nextBilling,
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

/**
 * 添削バッチの対象行が、すべて「実行した教員の uid」でログイン提出されたものか。
 * この場合は生徒チケット検査を省略し、教員の試し添削として扱う。
 */
export function allProofreadTargetsAreSelfSubmitted(rows: Submission[], operatorUid: string): boolean {
  const u = (operatorUid ?? "").trim();
  if (!u || rows.length === 0) return false;
  return rows.every((s) => String(s.submittedByUid ?? "").trim() === u);
}

/**
 * Day3 添削を実行する前に、運用教員の残チケットがバッチ件数分あるか検査する（減算はしない）。
 * チケットは教員が購入したプールから、Day4 確定時に消費される。
 */
export async function assertTeacherHasTicketsForProofread(
  teacherUid: string,
  requiredCount: number,
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const u = (teacherUid ?? "").trim();
  const need = Math.floor(Number(requiredCount));
  if (!u || !Number.isFinite(need) || need <= 0) {
    return { ok: true };
  }
  const bal = await getTicketBalanceForUid(u);
  if (bal < need) {
    return {
      ok: false,
      code: "INSUFFICIENT_TEACHER_TICKETS",
      message: `教員のチケットが不足しています（この条件の添削対象: ${need} 件分 / 残り: ${bal} 枚）。「招待QRとチケット状況」で購入してください。`,
    };
  }
  return { ok: true };
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

export type ProofreadOrgConsumeOptions = {
  /**
   * 先にチケットを使う UID（例: 該当提出の `submittedByUid`）。
   * 共有プールのうち「提出した生徒」から減らしたいときに指定する。
   */
  prioritizeUids?: string[];
  /**
   * 最後に回す UID（例: 添削ボタンを押した教員）。テナント内に他メンバーの残チケットがある間は減らない。
   */
  deprioritizeUid?: string;
};

/**
 * 同一 organizationId のユーザー全体を共有プールとして減算する。
 * - prioritizeUids にあるメンバーを先に、deprioritizeUid（運用者）は最後に消費する。
 * - 未指定時は残高が多い順（従来の安定ソート）。
 */
export async function consumeProofreadTicketsFromOrganization(
  organizationId: string,
  count: number,
  options?: ProofreadOrgConsumeOptions,
): Promise<OrgConsumeResult> {
  const oid = (organizationId ?? "").trim();
  const c = Math.floor(Number(count));
  const dep = String(options?.deprioritizeUid ?? "").trim();
  const rawPri = (options?.prioritizeUids ?? []).map((u) => String(u ?? "").trim()).filter(Boolean);
  const prioritizeSet = new Set(rawPri.filter((u) => u !== dep));

  if (!oid || !Number.isFinite(c) || c <= 0) {
    return { ok: true, remainingTotal: 0, consumedTotal: 0, consumedFrom: [] };
  }

  const db = getAdminFirestore();
  const userSnap = await db.collection("users").where("organizationId", "==", oid).get();
  if (userSnap.empty) return { ok: false, code: "NO_MEMBER" };

  type Row = { uid: string; current: number; billing: Record<string, unknown>; tier: number };
  const tierFor = (uid: string): number => {
    if (dep && uid === dep) return 2;
    if (prioritizeSet.has(uid)) return 0;
    return 1;
  };

  const rows: Row[] = userSnap.docs.map((doc) => {
    const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
    const t = billing["tickets"];
    const current = typeof t === "number" && Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
    const uid = doc.id;
    return { uid, current, billing, tier: tierFor(uid) };
  });

  const total = rows.reduce((acc, r) => acc + r.current, 0);
  if (total < c) return { ok: false, code: "INSUFFICIENT" };

  const prioritized = [...rows].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
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
