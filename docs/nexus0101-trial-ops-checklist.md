# nexus0101 試験運用チェックリスト

最終更新: 2026-05-06
対象プロジェクト: `nexus0101-35b17`
対象リージョン: `asia-northeast1`（Cloud Run）

---

## 1. ログイン・基本導線

- [ ] 生徒用 URL で Google ログインできる
- [ ] 教師用 URL で Google ログインできる
- [ ] 招待 QR から `sign-in` を開き、ログイン後に `/submit` へ遷移する
- [ ] 生徒アカウントの `organizationId` が招待先で反映される

## 2. 課金・チケット

- [ ] `settings` または `ops/tickets` から Stripe Checkout に遷移できる
- [ ] 決済完了後に `users/{uid}.billing.tickets` が加算される
- [ ] `users/{uid}.billing.stripeCustomerId` に `cus_...` が保存される
- [ ] 生徒/教師画面でチケット残高が反映される

## 3. Webhook（Cloud Functions）

- [ ] `checkout.session.completed` が 200 で受信される
- [ ] `charge.refunded`（必要時）が 200 で受信される
- [ ] 署名検証エラー/環境変数不足エラーが出ない

## 4. 教師運用

- [ ] `/ops/tickets` で教師がチケット購入できる
- [ ] 生徒へチケット配布できる（同一 `organizationId` のみ）
- [ ] 配布履歴に配布先が表示される
- [ ] 招待リンクのコピー・QR 共有が動く

## 5. 添削・Day4

- [ ] 提出から添削実行まで通る（チケット消費が反映）
- [ ] Day4 実行で QR と URL が生成される
- [ ] QR 読み取り先 URL で音声が 404 にならず再生できる

## 6. 権限・管理

- [ ] `/admin` は許可 UID のみアクセスできる
- [ ] 教師ロールで生徒チケット状況を確認できる
- [ ] 管理者の返金/手動調整が想定どおり動く

## 7. 設定整合（本番同等）

- [ ] Cloud Run は `asia-northeast1` 側 URL を利用している
- [ ] Cloud Run の機密値は Secret Manager 参照になっている
- [ ] Functions の `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `RESEND_API_KEY` が secrets 設定済み
- [ ] Firebase Auth 承認済みドメインに試験運用ドメイン（`run.app` / 独自ドメイン）を登録済み

---

## 当日運用の最小手順

1. 教師アカウントでログイン
2. 生徒を招待（QR またはリンク）
3. 教師がチケット購入
4. 生徒へ必要枚数を配布
5. 生徒提出 -> 添削 -> 結果確認
6. 必要なら Day4 生成 -> 紙配布用 QR の疎通確認

