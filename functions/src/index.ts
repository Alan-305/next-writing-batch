import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { logger } from "firebase-functions";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";

import { PRODUCT_ID_NEXT_WRITING_BATCH } from "./product-ids";

admin.initializeApp();

const db = admin.firestore();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2026-04-22.dahlia",
    })
  : null;
const STRIPE_PRICE_BY_PLAN = {
  "1m": process.env.STRIPE_PRICE_1M?.trim() ?? "",
  "3m": process.env.STRIPE_PRICE_3M?.trim() ?? "",
  "6m": process.env.STRIPE_PRICE_6M?.trim() ?? "",
  "12m": process.env.STRIPE_PRICE_12M?.trim() ?? "",
} as const;
const TICKETS_BY_PLAN = {
  "1m": 5,
  "3m": 15,
  "6m": 30,
  "12m": 60,
} as const;

/**
 * 新規ユーザー登録時:
 * - users/{uid} と entitlements/{productId} の雛形をサーバーで作成（クライアントは書けないルールと整合）
 * - billing は初期 {}（Stripe Webhook 等での更新のみ想定）
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
      billing: {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(entRef, {
      status: "none" as const,
      source: null,
      expiresAt: null,
      organizationId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  await maybeSendWelcomeEmail(uid, email);
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }
  if (!stripe || !stripeWebhookSecret) {
    logger.error("Stripe 環境変数が不足しています", {
      hasSecretKey: Boolean(stripeSecretKey),
      hasWebhookSecret: Boolean(stripeWebhookSecret),
    });
    res.status(500).send("Stripe is not configured");
    return;
  }

  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).send("Missing Stripe signature");
    return;
  }

  let event: { id: string; type: string; data: { object: unknown } };
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, stripeWebhookSecret);
  } catch (error) {
    logger.error("Stripe webhook 署名検証エラー", { error });
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      default:
        logger.info("未対応の Stripe イベントを受信", {
          eventType: event.type,
          eventId: event.id,
        });
    }
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error("Stripe webhook 処理エラー", { error, eventId: event.id, eventType: event.type });
    res.status(500).send("Webhook processing failed");
  }
});

export const createStripeCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (!stripe) {
    throw new functions.https.HttpsError("failed-precondition", "Stripe の設定が未完了です。");
  }

  const plan = parsePlan(data?.plan);
  const successUrl = parseRequiredUrl(data?.successUrl, "successUrl");
  const cancelUrl = parseRequiredUrl(data?.cancelUrl, "cancelUrl");
  const priceId = STRIPE_PRICE_BY_PLAN[plan];
  const tickets = TICKETS_BY_PLAN[plan];

  if (!priceId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `${plan} の Stripe priceId が未設定です。`,
    );
  }

  let session: { id: string; url: string | null };
  try {
    const created = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: context.auth.uid,
      metadata: {
        uid: context.auth.uid,
        productId: PRODUCT_ID_NEXT_WRITING_BATCH,
        plan,
        priceId,
        tickets: String(tickets),
      },
    });
    session = { id: created.id, url: created.url ?? null };
  } catch (error) {
    logger.error("Stripe checkout session 作成失敗", {
      uid: context.auth.uid,
      plan,
      priceId,
      error,
    });
    const stripeMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Stripe API の呼び出しに失敗しました。";
    throw new functions.https.HttpsError("internal", `Stripe error: ${stripeMessage}`);
  }

  return {
    sessionId: session.id,
    url: session.url,
  };
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
    welcomeEmailSentAt: FieldValue.serverTimestamp(),
  });
  logger.info("ウェルカムメール送信済み", { uid });
}

async function handleCheckoutCompleted(
  event: { id: string; type: string; data: { object: unknown } },
): Promise<void> {
  const session = event.data.object as {
    id: string;
    client_reference_id?: string | null;
    metadata?: Record<string, string | undefined>;
    customer?: string | null;
  };
  const uid = session.client_reference_id ?? session.metadata?.uid;
  if (!uid) {
    logger.warn("uid がない checkout.session.completed をスキップ", {
      eventId: event.id,
      sessionId: session.id,
    });
    return;
  }

  const ticketAmount = resolveTicketAmount(session);
  if (ticketAmount <= 0) {
    logger.warn("チケット数を解決できない checkout.session.completed をスキップ", {
      eventId: event.id,
      sessionId: session.id,
      uid,
    });
    return;
  }

  const userRef = db.doc(`users/${uid}`);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);
  const eventRef = db.doc(`stripe_webhook_events/${event.id}`);

  await db.runTransaction(async (tx) => {
    const [eventSnap, userSnap] = await Promise.all([tx.get(eventRef), tx.get(userRef)]);
    if (eventSnap.exists) {
      logger.info("重複 webhook をスキップ", { eventId: event.id, uid });
      return;
    }
    if (!userSnap.exists) {
      logger.warn("ユーザードキュメント未作成のため webhook をスキップ", { eventId: event.id, uid });
      tx.set(eventRef, {
        status: "skipped_missing_user",
        uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
    const existingTickets =
      typeof existingBilling["tickets"] === "number" ? (existingBilling["tickets"] as number) : 0;
    const nextTickets = existingTickets + ticketAmount;

    tx.update(userRef, {
      billing: {
        ...existingBilling,
        status: "active",
        tickets: nextTickets,
        stripeCustomerId: session.customer ?? null,
        lastCheckoutSessionId: session.id,
        lastTicketAdded: ticketAmount,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });
    tx.set(
      entRef,
      {
        status: "active",
        source: "stripe",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    tx.set(eventRef, {
      status: "processed",
      uid,
      sessionId: session.id,
      eventType: event.type,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

function resolveTicketAmount(session: {
  metadata?: Record<string, string | undefined>;
}): number {
  const priceId =
    session.metadata?.priceId ??
    session.metadata?.stripePriceId ??
    session.metadata?.planPriceId ??
    null;
  if (priceId) {
    const envTickets = lookupTicketsByPriceId(priceId);
    if (envTickets > 0) {
      return envTickets;
    }
  }

  const metadataTickets = Number(session.metadata?.tickets ?? 0);
  if (Number.isFinite(metadataTickets) && metadataTickets > 0) {
    return Math.floor(metadataTickets);
  }
  return 0;
}

function lookupTicketsByPriceId(priceId: string): number {
  const table: Record<string, number> = {
    [STRIPE_PRICE_BY_PLAN["1m"]]: TICKETS_BY_PLAN["1m"],
    [STRIPE_PRICE_BY_PLAN["3m"]]: TICKETS_BY_PLAN["3m"],
    [STRIPE_PRICE_BY_PLAN["6m"]]: TICKETS_BY_PLAN["6m"],
    [STRIPE_PRICE_BY_PLAN["12m"]]: TICKETS_BY_PLAN["12m"],
  };
  return table[priceId] ?? 0;
}

function parsePlan(value: unknown): keyof typeof STRIPE_PRICE_BY_PLAN {
  if (value === "1m" || value === "3m" || value === "6m" || value === "12m") {
    return value;
  }
  throw new functions.https.HttpsError(
    "invalid-argument",
    "plan は 1m / 3m / 6m / 12m のいずれかを指定してください。",
  );
}

function parseRequiredUrl(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new functions.https.HttpsError("invalid-argument", `${fieldName} は必須です。`);
  }
  try {
    const parsed = new URL(value);
    const isHttps = parsed.protocol === "https:";
    const isHttpLocalhost =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    if (!isHttps && !isHttpLocalhost) throw new Error("invalid protocol");
    return parsed.toString();
  } catch {
    throw new functions.https.HttpsError("invalid-argument", `${fieldName} の URL が不正です。`);
  }
}
