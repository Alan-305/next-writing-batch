import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";

import { resendApiKey } from "./runtime-config.js";
import {
  nearestTicketExpiryIso,
  resolveBillingTicketLots,
  sumTicketLots,
} from "./ticket-lots.js";

const WARN_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resendFromAddress(): string {
  const explicit = (process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? "").trim();
  return explicit || "Nexus Learning <onboarding@resend.dev>";
}

function isTeacherByRoles(roles: unknown): boolean {
  if (!Array.isArray(roles)) return false;
  const lower = roles.filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase());
  return lower.includes("teacher") || lower.includes("admin");
}

function ticketsPurchaseUrl(): string | null {
  const base = (process.env.NWB_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return base.startsWith("http") ? `${base}/ops/tickets` : `https://${base}/ops/tickets`;
}

function formatExpiryJa(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

async function sendExpiryReminderEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = resendApiKey.value().trim();
  if (!apiKey) {
    logger.info("RESEND_API_KEY 未設定のためチケット期限リマインドをスキップ");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: resendFromAddress(), to: [to], subject, text }),
  });
  if (!res.ok) {
    logger.error("チケット期限リマインド Resend エラー", { status: res.status, body: await res.text(), to });
    return false;
  }
  return true;
}

export async function runTicketExpiryReminderScan(nowMs = Date.now()): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
}> {
  const db = admin.firestore();
  const snap = await db.collection("users").where("roles", "array-contains", "teacher").get();
  let sent = 0;
  let skipped = 0;
  const purchaseUrl = ticketsPurchaseUrl();

  for (const doc of snap.docs) {
    if (!isTeacherByRoles(doc.get("roles"))) {
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

    if (!nearestExpiryIso || tickets <= 0) {
      skipped += 1;
      continue;
    }
    const expiryMs = Date.parse(nearestExpiryIso);
    if (!Number.isFinite(expiryMs) || expiryMs <= nowMs) {
      skipped += 1;
      continue;
    }
    const daysLeft = (expiryMs - nowMs) / MS_PER_DAY;
    if (daysLeft > WARN_DAYS || alreadySentFor === nearestExpiryIso) {
      skipped += 1;
      continue;
    }

    let email = "";
    try {
      const user = await admin.auth().getUser(doc.id);
      email = (user.email ?? "").trim();
    } catch {
      skipped += 1;
      continue;
    }
    if (!email) {
      skipped += 1;
      continue;
    }

    const expiryLabel = formatExpiryJa(nearestExpiryIso);
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

    const ok = await sendExpiryReminderEmail(
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

/** 毎日 9:00（JST）に教員へ有効期限7日前リマインドを送る */
export const ticketExpiryReminderDaily = functions
  .runWith({ secrets: [resendApiKey], timeoutSeconds: 540 })
  .pubsub.schedule("0 9 * * *")
  .timeZone("Asia/Tokyo")
  .onRun(async () => {
    const result = await runTicketExpiryReminderScan();
    logger.info("ticketExpiryReminderDaily 完了", result);
  });
