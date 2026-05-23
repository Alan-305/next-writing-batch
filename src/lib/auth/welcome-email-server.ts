import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";

import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export type WelcomeEmailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "already_sent" | "no_api_key" | "no_email" | "no_user_doc" | "in_flight" }
  | { status: "failed"; message: string };

/** 送信ロックが古い場合のみ再試行（クラッシュ等の取り残し） */
const WELCOME_EMAIL_SEND_LOCK_STALE_MS = 5 * 60 * 1000;

function resendFromAddress(): string {
  const explicit = (process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? "").trim();
  return explicit || "Nexus Learning <onboarding@resend.dev>";
}

function inFlightStartedAtMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (raw instanceof Timestamp) return raw.toMillis();
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "object" && raw !== null && "toDate" in raw) {
    const d = (raw as { toDate: () => Date }).toDate();
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

type WelcomeEmailClaim =
  | { ok: true }
  | { ok: false; reason: "already_sent" | "in_flight" | "no_user_doc" };

/** Firestore 上で送信権を原子的に確保（onCreate / 登録 API / クライアント再試行の競合を防ぐ） */
async function claimWelcomeEmailSend(userRef: DocumentReference): Promise<WelcomeEmailClaim> {
  const db = getAdminFirestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return { ok: false, reason: "no_user_doc" };
    if (snap.get("welcomeEmailSentAt") != null) return { ok: false, reason: "already_sent" };

    const inFlightMs = inFlightStartedAtMs(snap.get("welcomeEmailSendingAt"));
    if (
      inFlightMs != null &&
      Date.now() - inFlightMs < WELCOME_EMAIL_SEND_LOCK_STALE_MS
    ) {
      return { ok: false, reason: "in_flight" };
    }

    tx.update(userRef, { welcomeEmailSendingAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

async function releaseWelcomeEmailSendLock(userRef: DocumentReference): Promise<void> {
  try {
    await userRef.update({ welcomeEmailSendingAt: FieldValue.delete() });
  } catch (e) {
    console.warn("[welcome-email] failed to release send lock", { uid: userRef.id, e });
  }
}

/**
 * ウェルカムメールを冪等送信する（Firestore `welcomeEmailSentAt` + 送信中ロック）。
 * 送信タイミングは Auth onCreate（Functions）を主とし、本関数は再試行 API 用。
 */
export async function sendWelcomeEmailIfNeeded(uid: string): Promise<WelcomeEmailSendResult> {
  const u = uid.trim();
  if (!u) return { status: "failed", message: "uid が空です。" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error("[welcome-email] RESEND_API_KEY 未設定のためスキップ", { uid: u });
    return { status: "skipped", reason: "no_api_key" };
  }

  const from = resendFromAddress();
  if (from.includes("onboarding@resend.dev")) {
    console.error("[welcome-email] RESEND_FROM_EMAIL 未設定（検証用送信元のみ）", { uid: u });
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(u);

  const claim = await claimWelcomeEmailSend(userRef);
  if (!claim.ok) {
    if (claim.reason === "in_flight") {
      return { status: "skipped", reason: "in_flight" };
    }
    return { status: "skipped", reason: claim.reason };
  }

  let email = "";
  try {
    const rec = await getAdminAuth().getUser(u);
    email = (rec.email ?? "").trim();
  } catch (e) {
    await releaseWelcomeEmailSendLock(userRef);
    console.warn("[welcome-email] Auth getUser failed", { uid: u, e });
    return { status: "skipped", reason: "no_email" };
  }
  if (!email) {
    await releaseWelcomeEmailSendLock(userRef);
    console.warn("[welcome-email] メールアドレスなし", { uid: u });
    return { status: "skipped", reason: "no_email" };
  }

  const subject = "添削革命へようこそ";
  const text =
    "ご登録ありがとうございます。\n\n" +
    "このメールは Nexus Learning / next-writing-batch のアカウント登録時に自動送信されています。\n";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFromAddress(),
        to: [email],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      await releaseWelcomeEmailSendLock(userRef);
      console.error("[welcome-email] Resend API error", { status: res.status, body, uid: u });
      return { status: "failed", message: `Resend API error (${res.status})` };
    }

    await userRef.update({
      welcomeEmailSentAt: FieldValue.serverTimestamp(),
      welcomeEmailSendingAt: FieldValue.delete(),
    });
    console.info("[welcome-email] sent", { uid: u });
    return { status: "sent" };
  } catch (e) {
    await releaseWelcomeEmailSendLock(userRef);
    console.error("[welcome-email] send failed", { uid: u, e });
    return { status: "failed", message: e instanceof Error ? e.message : "送信に失敗しました。" };
  }
}
