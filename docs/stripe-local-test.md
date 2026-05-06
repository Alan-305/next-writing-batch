# Stripe 連携ローカル検証手順

## 1. 前提

- `.env.local` に Firebase クライアント設定と Stripe テスト鍵を設定する
- Functions 側環境変数を設定する
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_1M`
  - `STRIPE_PRICE_3M`
  - `STRIPE_PRICE_6M`
  - `STRIPE_PRICE_12M`

## 2. 起動（ターミナルを3つ使用）

1. Next.js
   - `npm run dev`
2. Firebase Emulator（Auth / Firestore / Functions）
   - `npm run firebase:emulators`
3. Stripe CLI（Webhook転送）
   - `stripe listen --forward-to http://127.0.0.1:5001/<firebase-project-id>/us-central1/stripeWebhook`

> `<firebase-project-id>` は Emulator で使用中のプロジェクトIDに置き換える。

## 3. Webhookシークレット反映

- `stripe listen` の表示にある `whsec_...` を `STRIPE_WEBHOOK_SECRET` に設定する。

## 4. 動作確認

1. Google ログイン後に `/settings` を開く
2. 「チケット購入（テスト）」でプランを選択して Checkout へ遷移
3. Stripe テストカードで決済完了
   - 例: `4242 4242 4242 4242`
4. Firestore Emulator で以下を確認
   - `users/{uid}.billing.tickets` が増える
   - `users/{uid}/entitlements/next-writing-batch.status` が `active`
   - `stripe_webhook_events/{eventId}` が `processed`

## 5. 既知の注意点

- 同じ webhook event は `stripe_webhook_events/{eventId}` で冪等処理されるため二重加算されない。
- `client_reference_id` または `metadata.uid` がない Checkout 完了イベントはスキップされる。

## 6. 返金（例外対応）

### Stripe 側

- Dashboard または API で該当決済を **Refund** する。
- Webhook で `charge.refunded` を受けると、PaymentIntent の `metadata`（Checkout 作成時にコピー）の `uid` / `tickets` に基づき、**返金額の割合に応じてチケットを減算**する（部分返金は累積差分で処理）。
- ローカル検証: `stripe listen` が `charge.refunded` を転送していること、本番では Dashboard で同イベントを購読する。

### 手動調整（管理者）

- Callable `adminCreateStripeRefund`（管理者のみ）: Stripe に返金を作成。続く `charge.refunded` でチケット按分減算。**同じ決済に対して `adminAdjustBillingTickets` の負数と併用しない**（二重減算）。
- Callable `adminAdjustBillingTickets`（管理者 UID のみ）: Firestore のチケットだけを増減（Stripe 返金なしの例外用）。
- UI: 管理画面（allowlist 済みアカウントでログイン）から `/admin/billing` を開く。
- Functions 環境変数 **`ADMIN_UIDS`**（カンマ区切り）を **`functions/.env.local`** に必ず書く。ルートの `.env.local` は Emulator の Functions には渡らないため、`NEXT_PUBLIC_FIREBASE_ADMIN_UIDS` だけでは Callable 側の管理者判定が空になり `permission-denied` になる。
- 本番デプロイ時は Secret / `firebase functions:config` 等で同じ UID 一覧を設定する。
- 引数例: `targetUserId`, `deltaTickets`（減らすなら負の整数）, `reason`, 任意で `idempotencyKey`。
