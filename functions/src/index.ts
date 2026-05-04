import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { logger } from "firebase-functions";

import { PRODUCT_ID_NEXT_WRITING_BATCH } from "./product-ids";

admin.initializeApp();

const db = admin.firestore();

/**
 * 新規ユーザー登録時:
 * - users/{uid} と entitlements/{productId} の雛形をサーバーで作成（クライアントは書けないルールと整合）
 * - RESEND_API_KEY が Functions の環境にあればウェルカムメール（冪等: welcomeEmailSentAt）
 *
 * リージョン未指定 = 既定の us-central1（初回デプロイで asia-northeast1 が失敗する事例の回避）。
 * 東京に固定したい場合は、一度成功後に .region("asia-northeast1") を検討。
 */
export const onAuthUserCreate = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const email = user.email;

  const userRef = db.doc(`users/${uid}`);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.exists) {
      return;
    }
    tx.set(userRef, {
      roles: [] as string[],
      organizationId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(entRef, {
      status: "none" as const,
      source: null,
      expiresAt: null,
      organizationId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  await maybeSendWelcomeEmail(uid, email);
});

async function maybeSendWelcomeEmail(uid: string, email: string | undefined): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.RESEND_FROM ?? "Nexus Learning <onboarding@resend.dev>").trim();
  if (!apiKey) {
    logger.info("RESEND_API_KEY 未設定のためウェルカムメールをスキップします", { uid });
    return;
  }
  if (!email) {
    logger.warn("メールアドレスなしのためウェルカムメールをスキップします", { uid });
    return;
  }

  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (snap.get("welcomeEmailSentAt") != null) {
    logger.info("welcomeEmailSentAt 済みのためスキップ", { uid });
    return;
  }

  const subject = "Next Writing Batch へようこそ";
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
      from,
      to: [email],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error("Resend API エラー", { status: res.status, body, uid });
    return;
  }

  await userRef.update({
    welcomeEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info("ウェルカムメール送信済み", { uid });
}
