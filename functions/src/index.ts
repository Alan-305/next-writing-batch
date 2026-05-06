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

function parseAdminUidSet(): Set<string> {
  const raw = (
    process.env.ADMIN_UIDS ??
    process.env.NEXT_PUBLIC_FIREBASE_ADMIN_UIDS ??
    ""
  )
    .replace(/\r/g, "")
    .trim();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function isAdminUid(uid: string): boolean {
  return parseAdminUidSet().has(uid.trim());
}

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
      case "charge.refunded":
        await handleChargeRefunded(event);
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

  const userRef = db.doc(`users/${context.auth.uid}`);
  const userSnap = await userRef.get();
  const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
  const existingStripeCustomerId =
    typeof existingBilling["stripeCustomerId"] === "string" &&
    existingBilling["stripeCustomerId"].startsWith("cus_")
      ? existingBilling["stripeCustomerId"]
      : null;

  let customerEmail: string | undefined;
  if (!existingStripeCustomerId) {
    try {
      const rec = await admin.auth().getUser(context.auth.uid);
      if (rec.email) customerEmail = rec.email;
    } catch (error) {
      logger.warn("Auth からメール取得に失敗（Checkout は続行）", {
        uid: context.auth.uid,
        error,
      });
    }
  }

  let session: { id: string; url: string | null };
  try {
    const checkoutMetadata = {
      uid: context.auth.uid,
      productId: PRODUCT_ID_NEXT_WRITING_BATCH,
      plan,
      priceId,
      tickets: String(tickets),
    };
    const created = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: context.auth.uid,
      metadata: checkoutMetadata,
      payment_intent_data: {
        metadata: checkoutMetadata,
      },
      ...(existingStripeCustomerId
        ? { customer: existingStripeCustomerId }
        : {
            customer_creation: "always",
            ...(customerEmail ? { customer_email: customerEmail } : {}),
          }),
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

/**
 * 例外返金など: 管理者のみ。チケット数を増減（通常は負数）し、0 なら entitlements を none に戻す。
 * idempotencyKey を渡すと同じキーは1回だけ反映（手動二重実行防止）。
 */
export const adminAdjustBillingTickets = functions.https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new functions.https.HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (!isAdminUid(callerUid)) {
    throw new functions.https.HttpsError("permission-denied", "管理者のみ実行できます。");
  }

  const targetUserId = parseNonEmptyString(data?.targetUserId, "targetUserId");
  const deltaTickets = Number(data?.deltaTickets);
  if (!Number.isFinite(deltaTickets) || !Number.isInteger(deltaTickets)) {
    throw new functions.https.HttpsError("invalid-argument", "deltaTickets は整数で指定してください。");
  }
  const reason =
    typeof data?.reason === "string" ? data.reason.trim().slice(0, 500) : "";
  const idempotencyKey =
    typeof data?.idempotencyKey === "string" ? data.idempotencyKey.trim().slice(0, 200) : "";

  const idemRef = idempotencyKey ? db.doc(`admin_billing_adjustments/${idempotencyKey}`) : null;
  const userRef = db.doc(`users/${targetUserId}`);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  let nextTickets = 0;
  await db.runTransaction(async (tx) => {
    if (idemRef) {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const billing = (idemSnap.get("resultTickets") as number | undefined) ?? 0;
        nextTickets = billing;
        return;
      }
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "対象ユーザーのドキュメントが存在しません。",
      );
    }

    const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
    const current =
      typeof existingBilling["tickets"] === "number" ? (existingBilling["tickets"] as number) : 0;
    nextTickets = Math.max(0, current + deltaTickets);

    tx.update(userRef, {
      billing: {
        ...existingBilling,
        tickets: nextTickets,
        lastManualTicketDelta: deltaTickets,
        lastManualTicketReason: reason || null,
        lastManualTicketByUid: callerUid,
        updatedAt: FieldValue.serverTimestamp(),
      },
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
        adminUid: callerUid,
        resultTickets: nextTickets,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, targetUserId, tickets: nextTickets, deltaTickets };
});

/**
 * 管理者のみ。Stripe へ返金を作成する。成功後は charge.refunded Webhook でチケットが按分減算される。
 * 手動の adminAdjustBillingTickets（負数）と同一購入に対して併用しないこと（二重減算）。
 */
export const adminCreateStripeRefund = functions.https.onCall(async (data, context) => {
  const callerUid = context.auth?.uid;
  if (!callerUid) {
    throw new functions.https.HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (!isAdminUid(callerUid)) {
    throw new functions.https.HttpsError("permission-denied", "管理者のみ実行できます。");
  }
  if (!stripe) {
    throw new functions.https.HttpsError("failed-precondition", "Stripe の設定が未完了です。");
  }

  const expectedUid = parseNonEmptyString(data?.expectedUid, "expectedUid");
  const paymentIntentIdRaw =
    typeof data?.paymentIntentId === "string" ? data.paymentIntentId.trim() : "";
  const chargeIdRaw = typeof data?.chargeId === "string" ? data.chargeId.trim() : "";
  const checkoutSessionIdRaw =
    typeof data?.checkoutSessionId === "string" ? data.checkoutSessionId.trim() : "";

  const idCount = [paymentIntentIdRaw, chargeIdRaw, checkoutSessionIdRaw].filter(Boolean).length;
  if (idCount !== 1) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "paymentIntentId・chargeId・checkoutSessionId のいずれか1つだけ指定してください。",
    );
  }

  const idempotencyKey =
    typeof data?.idempotencyKey === "string" ? data.idempotencyKey.trim().slice(0, 200) : "";
  const note =
    typeof data?.note === "string" ? data.note.trim().slice(0, 500) : "";

  let paymentIntentId = "";
  if (checkoutSessionIdRaw) {
    if (!checkoutSessionIdRaw.startsWith("cs_")) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "checkoutSessionId は cs_ で始まる Checkout Session ID を指定してください。",
      );
    }
    try {
      const sess = await stripe.checkout.sessions.retrieve(checkoutSessionIdRaw);
      const sessionUid = (sess.client_reference_id ?? sess.metadata?.uid ?? "").trim();
      if (sessionUid !== expectedUid) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "この Checkout Session の購入者と expectedUid が一致しません。誤返金防止のため中止しました。",
        );
      }
      const piRef = sess.payment_intent;
      paymentIntentId = typeof piRef === "string" ? piRef : (piRef?.id ?? "");
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      logger.error("Checkout Session 取得失敗", { error, checkoutSessionId: checkoutSessionIdRaw });
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Checkout Session を取得できません。ID を確認してください。",
      );
    }
  } else if (chargeIdRaw) {
    try {
      const charge = await stripe.charges.retrieve(chargeIdRaw);
      const piRef = charge.payment_intent;
      paymentIntentId =
        typeof piRef === "string" ? piRef : (piRef?.id ?? "");
    } catch (error) {
      logger.error("Charge 取得失敗", { error, chargeId: chargeIdRaw });
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Charge を取得できません。ID を確認してください。",
      );
    }
  } else {
    paymentIntentId = paymentIntentIdRaw;
  }

  if (!paymentIntentId || !paymentIntentId.startsWith("pi_")) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "PaymentIntent ID を解決できませんでした。",
    );
  }

  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>>;
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    logger.error("PaymentIntent 取得失敗", { error, paymentIntentId });
    throw new functions.https.HttpsError(
      "invalid-argument",
      "PaymentIntent を取得できません。ID を確認してください。",
    );
  }

  const metaUid = pi.metadata?.uid?.trim();
  if (metaUid !== expectedUid) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "この決済の購入者（metadata.uid）と expectedUid が一致しません。誤返金防止のため中止しました。",
    );
  }

  let amount: number | undefined;
  if (data?.amount !== undefined && data?.amount !== null && data?.amount !== "") {
    const n = Number(data.amount);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "amount は正の整数（返金額・JPY なら円）で指定するか、全額返金なら省略してください。",
      );
    }
    amount = n;
  }

  const requestOptions: { idempotencyKey: string } | undefined = idempotencyKey
    ? { idempotencyKey }
    : undefined;

  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amount != null ? { amount } : {}),
        reason: "requested_by_customer",
        metadata: {
          adminUid: callerUid,
          expectedUid,
          ...(note ? { note } : {}),
        },
      },
      requestOptions,
    );

    return {
      ok: true as const,
      refundId: refund.id,
      status: refund.status,
      amount: refund.amount,
      currency: refund.currency,
      paymentIntentId,
    };
  } catch (error) {
    logger.error("Stripe refund 作成失敗", { error, paymentIntentId, callerUid });
    const stripeMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Stripe API の呼び出しに失敗しました。";
    throw new functions.https.HttpsError("internal", `Stripe error: ${stripeMessage}`);
  }
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

function paymentIntentIdFromSession(session: {
  payment_intent?: string | { id?: string } | null;
}): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  if (typeof pi === "string" && pi.startsWith("pi_")) return pi;
  const id = typeof pi === "object" && pi !== null ? pi.id : undefined;
  return typeof id === "string" && id.startsWith("pi_") ? id : null;
}

async function handleCheckoutCompleted(
  event: { id: string; type: string; data: { object: unknown } },
): Promise<void> {
  const session = event.data.object as {
    id: string;
    client_reference_id?: string | null;
    metadata?: Record<string, string | undefined>;
    customer?: string | null;
    payment_intent?: string | { id?: string } | null;
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
    const lastPaymentIntentId = paymentIntentIdFromSession(session);

    tx.update(userRef, {
      billing: {
        ...existingBilling,
        status: "active",
        tickets: nextTickets,
        stripeCustomerId: session.customer ?? null,
        lastCheckoutSessionId: session.id,
        ...(lastPaymentIntentId ? { lastPaymentIntentId } : {}),
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

/**
 * Stripe 返金に応じてチケットを按分減算する。
 * - Checkout 時に payment_intent.metadata に uid / tickets を載せている前提。
 * - 部分返金が複数回に分かれる場合は stripe_charge_refund_sync/{chargeId} で累積差分を処理。
 */
async function handleChargeRefunded(
  event: { id: string; type: string; data: { object: unknown } },
): Promise<void> {
  if (!stripe) return;

  const chargeRaw = event.data.object as {
    id: string;
    amount: number;
    amount_refunded: number;
    metadata?: Record<string, string>;
    payment_intent?: string | { id?: string } | null;
  };

  const chargeId = chargeRaw.id;
  let metadata: Record<string, string> = { ...(chargeRaw.metadata ?? {}) };
  let chargeAmount = chargeRaw.amount;
  const amountRefunded = chargeRaw.amount_refunded;

  if (!metadata.uid && chargeRaw.payment_intent) {
    const piId =
      typeof chargeRaw.payment_intent === "string"
        ? chargeRaw.payment_intent
        : (chargeRaw.payment_intent?.id ?? "");
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        metadata = { ...metadata, ...(pi.metadata ?? {}) };
        if (typeof pi.amount === "number" && pi.amount > 0) {
          chargeAmount = pi.amount;
        }
      } catch (error) {
        logger.error("PaymentIntent 取得失敗（返金処理スキップ）", { error, chargeId, piId });
        return;
      }
    }
  }

  const uid = metadata.uid?.trim();
  if (!uid) {
    logger.warn("charge.refunded: uid なしのためスキップ", { eventId: event.id, chargeId });
    return;
  }

  const bundleTickets = Number(metadata.tickets ?? 0);
  if (!Number.isFinite(bundleTickets) || bundleTickets <= 0) {
    logger.warn("charge.refunded: metadata.tickets 不正のためスキップ", {
      eventId: event.id,
      chargeId,
      uid,
    });
    return;
  }

  if (chargeAmount <= 0) {
    logger.warn("charge.refunded: charge.amount が不正のためスキップ", { eventId: event.id, chargeId });
    return;
  }

  const eventRef = db.doc(`stripe_webhook_events/${event.id}`);
  const syncRef = db.doc(`stripe_charge_refund_sync/${chargeId}`);
  const userRef = db.doc(`users/${uid}`);
  const entRef = userRef.collection("entitlements").doc(PRODUCT_ID_NEXT_WRITING_BATCH);

  await db.runTransaction(async (tx) => {
    const [eventSnap, syncSnap, userSnap] = await Promise.all([
      tx.get(eventRef),
      tx.get(syncRef),
      tx.get(userRef),
    ]);

    if (eventSnap.exists) {
      logger.info("重複 webhook（返金）をスキップ", { eventId: event.id, chargeId, uid });
      return;
    }

    if (!userSnap.exists) {
      logger.warn("ユーザードキュメント未作成のため返金 webhook をスキップ", {
        eventId: event.id,
        uid,
        chargeId,
      });
      tx.set(eventRef, {
        status: "skipped_missing_user",
        uid,
        chargeId,
        eventType: event.type,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const lastSynced =
      typeof syncSnap.get("lastAmountRefunded") === "number"
        ? (syncSnap.get("lastAmountRefunded") as number)
        : 0;
    const deltaRefund = amountRefunded - lastSynced;
    if (deltaRefund <= 0) {
      tx.set(eventRef, {
        status: "skipped_no_new_refund",
        uid,
        chargeId,
        amountRefunded,
        eventType: event.type,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const deductTickets = Math.floor((deltaRefund / chargeAmount) * bundleTickets);
    if (deductTickets <= 0) {
      tx.set(syncRef, {
        lastAmountRefunded: amountRefunded,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(eventRef, {
        status: "processed_zero_deduct",
        uid,
        chargeId,
        deltaRefund,
        eventType: event.type,
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const existingBilling = (userSnap.get("billing") ?? {}) as Record<string, unknown>;
    const currentTickets =
      typeof existingBilling["tickets"] === "number" ? (existingBilling["tickets"] as number) : 0;
    const nextTickets = Math.max(0, currentTickets - deductTickets);

    tx.update(userRef, {
      billing: {
        ...existingBilling,
        tickets: nextTickets,
        lastRefundChargeId: chargeId,
        lastRefundTicketsDeducted: deductTickets,
        lastRefundAmountDelta: deltaRefund,
        updatedAt: FieldValue.serverTimestamp(),
      },
    });

    tx.set(
      entRef,
      {
        status: nextTickets > 0 ? ("active" as const) : ("none" as const),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    tx.set(syncRef, {
      lastAmountRefunded: amountRefunded,
      bundleTickets,
      chargeAmount,
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(eventRef, {
      status: "processed",
      uid,
      chargeId,
      eventType: event.type,
      deductTickets,
      amountRefunded,
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

function parseNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new functions.https.HttpsError("invalid-argument", `${fieldName} は必須です。`);
  }
  return value.trim();
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
