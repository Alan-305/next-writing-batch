# nexus0101（検証）への Cloud Functions デプロイ

ルール: 本番 `nexus0301` の前に **検証プロジェクトで動作確認**する。

**現場試験向けに Firestore ＋ Functions をまとめて載せる手順**は [`nexus0101-field-trial-deploy.md`](./nexus0101-field-trial-deploy.md) を参照（`npm run firebase:deploy-0101-all`）。

## 前提

- Firebase CLI で `nexus0101-35b17` にログイン済み（`.firebaserc` の `default` がこのプロジェクト）。
- Stripe は**テストモード**のキーと Webhook を検証用に用意する。

## デプロイコマンド

```bash
cd /path/to/next-writing-batch
npm run firebase:deploy-functions:staging
```

`firebase:deploy-functions:staging` は **`nexus0101-35b17` にのみ** Functions をデプロイする（本番 `nexus0301` には触れない）。

従来どおり、デフォルトプロジェクト向けの次と同等です。

```bash
npm run firebase:deploy-functions
```

## Stripe Webhook（検証）

デプロイ後、Stripe Dashboard（テストモード）でエンドポイントを追加する。

- **URL**: `https://us-central1-nexus0101-35b17.cloudfunctions.net/stripeWebhook`
- **推奨イベント**: `checkout.session.completed`, `charge.refunded`

表示された **署名シークレット**（`whsec_...`）を、Cloud Functions のランタイム環境変数 **`STRIPE_WEBHOOK_SECRET`** に設定する（Secret Manager 推奨）。

## Cloud Functions に必要な環境変数（検証）

| 変数 | 用途 |
|------|------|
| `STRIPE_SECRET_KEY` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | Webhook 署名検証 |
| `STRIPE_PRICE_T10` など | Checkout の price ID（`STRIPE_PRICE_T10` / `T30` / `T60` / `T120`） |
| `ADMIN_UIDS` | 管理者 Callable（カンマ区切り・**ルート `.env.local` の allowlist と同じ UID**） |
| `RESEND_API_KEY` | 任意（ウェルカムメール） |

設定場所の例: Google Cloud Console → Cloud Functions → 各関数 → 編集 → ランタイム・環境変数。本番では **Secret Manager** への移行を推奨（ルール: 機密の直書き回避）。

## トラブルシュート

- デプロイで `gcf-sources-... denied` が出る場合: `functions/DEPLOY-NOTES.txt` を参照。
- Callable が `permission-denied` になる場合: **デプロイ先プロジェクト**の関数に `ADMIN_UIDS` が載っているか確認（ローカルの `functions/.env.local` はデプロイされない）。

## 添削 API（Next.js）とチケット

`/api/ops/run-proofread` は **運用教員の** `users/{uid}.billing.tickets` がバッチ件数分あるかを参照します。検証／本番の Next を動かすプロセスに、**同じ Firebase プロジェクト**へ書き込める Admin 資格情報（`GOOGLE_APPLICATION_CREDENTIALS` 等）を渡してください。ローカルでゲートを外す場合のみ `NWB_SKIP_PROOFREAD_TICKET_GATE=true`（`.env.example` 参照）。

## 次の段階（本番 nexus0301）

検証で問題なければ `npm run firebase:deploy-functions:prod` と Stripe 本番 Webhook を **本番プロジェクト用 URL** に差し替える。
