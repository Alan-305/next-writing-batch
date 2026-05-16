# Stripe チケット価格改定チェックリスト

UI の `priceLabel` だけ変更しても **実際の課金は変わりません**。必ず Stripe の **Price**（`price_...`）と Cloud Functions の **`STRIPE_PRICE_T*`** を揃えてください。

参照価格（税込・改定後）:

| 枚数 | 金額（円） |
|------|------------|
| 10 | 4,000 |
| 30 | 10,000 |
| 60 | 18,000 |
| 120 | 30,000 |

---

## 事前（共通）

- [ ] アプリ側の購入画面（`/ops/tickets` の `PLAN_OPTIONS`）が上表と一致している
- [ ] プロダクト憲法・運用資料（`.cursor/rules/firebase-integration-and-data-design.mdc` 等）の表記も必要なら同じ値にそろえる
- [ ] Stripe で **同名 Product に新しい recurring/one-time Price を追加するか方針を決める**（既存 `price_...` を編集できるのは Stripe のルール次第。不明な場合は **新規 Price を作り env を差し替え** が安全）

---

## Stripe Dashboard

### 検証（Test mode）

- [ ] Test mode で 4 パック分の Price を作成（または既存 Price の金額が改定値であることを確認）
- [ ] 各 Price ID（`price_...`）をメモ：`T10` / `T30` / `T60` / `T120` 対応が取れるようにラベルを付ける
- [ ] Webhook が **`checkout.session.completed`**, **`charge.refunded`** を受けている（既存運用どおり）

### 本番（Live mode）

- [ ] Live mode で上と同様に **4 Price** を用意し ID を別途メモ（Test と ID は異なる）

---

## Cloud Functions の環境変数

対象関数: **`createStripeCheckoutSession`**（必ず）※ `stripeWebhook` は Price ID でチケット数をマッピングするため、**新 `price_...` がコード／設定に反映されていないと加算できない**

値は **`price_...` のみ**（`KEY=value` 形式を値欄にべた書きしない）。Secret Manager 利用を推奨。

| 変数 | 内容 |
|------|------|
| `STRIPE_PRICE_T10` | 10枚パック用 `price_...` |
| `STRIPE_PRICE_T30` | 30枚パック用 |
| `STRIPE_PRICE_T60` | 60枚パック用 |
| `STRIPE_PRICE_T120` | 120枚パック用 |

### 検証プロジェクト（`nexus0101-35b17`）

- [ ] 上記 4 変数が **Stripe Test mode の Price ID** に向いている
- [ ] `STRIPE_SECRET_KEY` が **テスト鍵**
- [ ] **`stripeWebhook` 用の `STRIPE_WEBHOOK_SECRET`** が、検証用 Webhook URL のシークレットと一致している  
      例: `https://us-central1-nexus0101-35b17.cloudfunctions.net/stripeWebhook`（[`deploy-nexus0101-functions.md`](./deploy-nexus0101-functions.md) 参照）
- [ ] 変更後、Functions を再デプロイ（例: `npm run firebase:deploy-functions:staging`）
- [ ] **`npm run firebase:deploy-functions:prod` の `--project`** が実際には **0101** を指している。本番 **`nexus0301`** に載せる場合は **`firebase deploy --only functions --project nexus0301`** など、意図したプロジェクトで実行していることを確認する（`package.json` のスクリプトと要照合）

### 本番プロジェクト（`nexus0301`）

- [ ] 上記 4 変数が **Stripe Live mode の Price ID** に向いている
- [ ] `STRIPE_SECRET_KEY` が **本番鍵**
- [ ] **`stripeWebhook` の `STRIPE_WEBHOOK_SECRET`** が **本番 Webhook の `whsec_...`** と一致している（検証と混同しない）
- [ ] 本番用 Functions を **nexus0301** にデプロイ済み

---

## Next.js / Cloud Run（表示・接続のみ）

請求そのものは Stripe 側。ここでは **ユーザーに見える価格** と **Firebase 接続先**の確認。

- [ ] デプロイしたビルドに、新しい `PLAN_OPTIONS` が含まれている（古い CDN / イメージに注意）
- [ ] アプリが参照している Firebase プロジェクトが、環境ごとに正しい（0101 と 0301 を取り違えない）

---

## 変更後スモークテスト（環境ごと）

- [ ] 教員でログインし **`/ops/tickets`** で各プランを選び、Checkout に遷移できる
- [ ] Checkout 画面の **支払額**が改定後の税込みと一致する
- [ ] テストカードで完了 → Firestore **`users/{uid}.billing.tickets`** が期待枚数増加、`lastCheckoutSessionId` などが更新される
- [ ] Webhook が失敗ログを出していない（Cloud Logging で `stripeWebhook` を確認）

---

## 運用メモ（任意）

- [ ] 特商法・利用規約・LP など、**サイト外の価格表記**がある場合は別途修正
- [ ] 旧 Price を Stripe で **アーカイブ**して新規 Checkout で誤用されないようにする（運用ポリシーに合わせる）

---

関連: [`stripe-local-test.md`](./stripe-local-test.md)、[`deploy-nexus0101-functions.md`](./deploy-nexus0101-functions.md)、[`nexus0101-field-trial-deploy.md`](./nexus0101-field-trial-deploy.md)。
