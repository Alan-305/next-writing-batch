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
