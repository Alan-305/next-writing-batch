import { FieldValue } from "firebase-admin/firestore";

import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export type WelcomeEmailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "already_sent" | "no_api_key" | "no_email" | "no_user_doc" }
  | { status: "failed"; message: string };

function resendFromAddress(): string {
  const explicit = (process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? "").trim();
  return explicit || "Nexus Learning <onboarding@resend.dev>";
}

/**
 * ウェルカムメールを冪等送信する（Firestore `welcomeEmailSentAt`）。
 * Cloud Functions の onCreate と同内容。Next.js の RESEND_API_KEY を使用（Cloud Run 運用向け）。
 */
export async function sendWelcomeEmailIfNeeded(uid: string): Promise<WelcomeEmailSendResult> {
  const u = uid.trim();
  if (!u) return { status: "failed", message: "uid が空です。" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[welcome-email] RESEND_API_KEY 未設定のためスキップ", { uid: u });
    return { status: "skipped", reason: "no_api_key" };
  }

  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(u);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { status: "skipped", reason: "no_user_doc" };
  }
  if (snap.get("welcomeEmailSentAt") != null) {
    return { status: "skipped", reason: "already_sent" };
  }

  let email = "";
  try {
    const rec = await getAdminAuth().getUser(u);
    email = (rec.email ?? "").trim();
  } catch (e) {
    console.warn("[welcome-email] Auth getUser failed", { uid: u, e });
    return { status: "skipped", reason: "no_email" };
  }
  if (!email) {
    console.warn("[welcome-email] メールアドレスなし", { uid: u });
    return { status: "skipped", reason: "no_email" };
  }

  const subject = "添削革命へようこそ";
  const text =
    "ご登録ありがとうございます。\n\n" +
    "このメールは Nexus Learning / next-writing-batch のアカウント登録時に自動送信されています。\n";

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
    console.error("[welcome-email] Resend API error", { status: res.status, body, uid: u });
    return { status: "failed", message: `Resend API error (${res.status})` };
  }

  await userRef.update({
    welcomeEmailSentAt: FieldValue.serverTimestamp(),
  });
  console.info("[welcome-email] sent", { uid: u });
  return { status: "sent" };
}
