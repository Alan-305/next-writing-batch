import { FieldValue } from "firebase-admin/firestore";

import {
  formatTicketExpiryJa,
  nearestTicketExpiryIso,
  resolveBillingTicketLots,
  sumTicketLots,
} from "@/lib/billing/ticket-lots";
import { sendResendPlainEmail } from "@/lib/notifications/teacher-notify";
import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

const WARN_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TicketExpiryReminderResult = {
  scanned: number;
  sent: number;
  skipped: number;
};

function ticketsPurchaseUrl(): string | null {
  const base = (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NWB_PROOFREAD_WORKER_URL ??
    process.env.VERCEL_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;
  return base.startsWith("http") ? `${base}/ops/tickets` : `https://${base}/ops/tickets`;
}

function shouldSendExpiryWarning(
  nearestExpiryIso: string | null,
  tickets: number,
  alreadySentFor: string | null,
  nowMs: number,
): boolean {
  if (tickets <= 0 || !nearestExpiryIso) return false;
  const expiryMs = Date.parse(nearestExpiryIso);
  if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) return false;
  const daysLeft = (expiryMs - nowMs) / MS_PER_DAY;
  if (daysLeft > WARN_DAYS) return false;
  if (alreadySentFor === nearestExpiryIso) return false;
  return true;
}

/**
 * 有効期限が7日以内の教員にリマインドメールを送る（同一失効日につき1回）。
 */
export async function runTicketExpiryReminderJob(nowMs = Date.now()): Promise<TicketExpiryReminderResult> {
  const db = getAdminFirestore();
  const auth = getAdminAuth();
  const purchaseUrl = ticketsPurchaseUrl();

  const snap = await db.collection("users").where("roles", "array-contains", "teacher").get();
  let sent = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const roles = normalizeRoles(doc.get("roles"));
    if (!isTeacherByRoles(roles)) {
      skipped += 1;
      continue;
    }

    const billing = (doc.get("billing") ?? {}) as Record<string, unknown>;
    const { lots } = resolveBillingTicketLots(billing, nowMs);
    const tickets = sumTicketLots(lots);
    const nearestExpiryIso = tickets > 0 ? nearestTicketExpiryIso(lots, nowMs) : null;
    const alreadySentFor =
      typeof billing.ticketExpiryWarningSentFor === "string"
        ? billing.ticketExpiryWarningSentFor.trim()
        : null;

    if (!shouldSendExpiryWarning(nearestExpiryIso, tickets, alreadySentFor, nowMs)) {
      skipped += 1;
      continue;
    }

    let email = "";
    try {
      const user = await auth.getUser(doc.id);
      email = (user.email ?? "").trim();
    } catch {
      skipped += 1;
      continue;
    }
    if (!email) {
      skipped += 1;
      continue;
    }

    const expiryLabel = formatTicketExpiryJa(nearestExpiryIso!);
    const lines = [
      "チケットの有効期限が近づいています。",
      "",
      `残りチケット: ${tickets} 枚`,
      `有効期限: ${expiryLabel}まで`,
      "",
      "期限を過ぎると添削の確定・公開ができなくなります。",
      "お早めにチケットのご購入をご検討ください。",
    ];
    if (purchaseUrl) lines.push("", `チケット購入: ${purchaseUrl}`);
    lines.push("", "— 添削革命 / next-writing-batch");

    const ok = await sendResendPlainEmail(
      email,
      `【添削革命】チケット有効期限のお知らせ（${expiryLabel}まで）`,
      lines.join("\n"),
    );
    if (!ok) {
      skipped += 1;
      continue;
    }

    await doc.ref.update({
      billing: {
        ...billing,
        ticketExpiryWarningSentFor: nearestExpiryIso,
        ticketExpiryWarningSentAt: FieldValue.serverTimestamp(),
      },
    });
    sent += 1;
  }

  return { scanned: snap.size, sent, skipped };
}
