# nexus0101（検証）を「現場試験運用」向けに一式デプロイする

プロジェクト ID は **`nexus0101-35b17`**（`.firebaserc` の `default`）。本番 **`nexus0301`** には触れません。

---

## 1. リポジトリから一括デプロイ（Firestore ＋ Functions）

ローカルで `firebase login` 済みであること。

```bash
cd /path/to/next-writing-batch
npm run firebase:deploy-0101-all
```

これで次が **同じプロジェクト**に載ります。

- **Firestore**: セキュリティルール（`firestore.rules`）とインデックス定義（`firestore.indexes.json`）
- **Cloud Functions**: `functions/`（predeploy で `tsc` → デプロイ）

Functions だけ更新したいときは従来どおり:

```bash
npm run firebase:deploy-functions:staging
```

ルールだけなら:

```bash
npm run firebase:deploy-rules
```

（`default` が 0101 のときは `--project` 省略可。迷う場合は `firebase use` で確認。）

---

## 2. Cloud Functions（0101）の環境変数 — 必須チェック

Google Cloud Console → **Cloud Functions** → **各関数** → 編集 → **ランタイム・環境変数**。

| 変数 | 必要な関数の目安 | 用途 |
|------|------------------|------|
| `STRIPE_SECRET_KEY` | `createStripeCheckoutSession`, `stripeWebhook`, `adminCreateStripeRefund` | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | **`stripeWebhook` のみ**（他関数には不要だが付いても可） | Webhook 署名 |
| `STRIPE_PRICE_T10`, `STRIPE_PRICE_T30`, `STRIPE_PRICE_T60`, `STRIPE_PRICE_T120` | `createStripeCheckoutSession` | Price ID（値は **`price_...` のみ**。`KEY=value` を値欄に書かない） |
| `ADMIN_UIDS` | `adminAdjustBillingTickets`, `adminCreateStripeRefund` | 管理者 UID（カンマ区切り。**ルート `.env.local` の `NEXT_PUBLIC_FIREBASE_ADMIN_UIDS` と同一**） |
| `RESEND_API_KEY` | `onAuthUserCreate` | ウェルカムメール（未設定なら送信スキップ等の実装に依存） |
| `RESEND_FROM` | `onAuthUserCreate` | 任意。送信元表示 |

**よくある不具合:** `stripeWebhook` にだけ `STRIPE_WEBHOOK_SECRET` が無い → 署名検証で失敗。`createStripeCheckoutSession` にだけ Stripe キーが無い → Checkout 作成失敗。

---

## 3. Stripe（テストモード）— 検証用

- **Webhook URL**: `https://us-central1-nexus0101-35b17.cloudfunctions.net/stripeWebhook`
- **イベント**: `checkout.session.completed`, `charge.refunded`（運用に合わせて追加）
- ダッシュボードに表示される **署名シークレット**（`whsec_...`）を、上記 **`STRIPE_WEBHOOK_SECRET`** に設定（**`stripe listen` 用と本番 URL 用は別**。Cloud に届いているエンドポイントのシークレットを使う）

---

## 4. Next.js（Cloud Run 等）— 0101 に向けた環境変数

ビルド・実行環境に、**検証用 Firebase** が揃っていること（`.env.example` 参照）。

- **`NEXT_PUBLIC_FIREBASE_*`**: すべて **nexus0101-35b17** の Web アプリ設定値
- **`NEXT_PUBLIC_FIREBASE_USE_EMULATOR=false`**（実プロジェクトに接続するとき）
- **Admin 検証**: `FIREBASE_SERVICE_ACCOUNT_JSON` または `GOOGLE_APPLICATION_CREDENTIALS`（**0101 プロジェクト**のサービスアカウント。Git に含めない）
- **`NEXT_PUBLIC_FIREBASE_ADMIN_UIDS`**: Functions の `ADMIN_UIDS` と同じ UID
- **添削 API**: `NEXT_WRITING_BATCH_KEY`（Secret Manager / Cloud Run。運用で添削を回すなら必須）
- **チケットゲート**: 現場試験では **`NWB_SKIP_PROOFREAD_TICKET_GATE` を本番相当で false / 未設定**にし、`users/{uid}.billing.tickets` が Functions と同じ Firestore を見ること
- **Resend（Next のお問い合わせ等）**: `RESEND_API_KEY` など、`.env.example` の「① Next.js」節

Docker / Cloud Run 向けの土台はリポジトリの `Dockerfile`。環境変数は **Cloud Run の設定または Secret Manager** に載せる。

---

## 5. Firebase Authentication

- **Google ログイン**を有効化
- **承認済みドメイン**に、試験で使う **Cloud Run の URL**（およびカスタムドメインがあればそれ）を追加

---

## 6. 試験前のスモークテスト（最短）

1. ブラウザでアプリを開き **Google ログイン**
2. Firestore に **`users/{uid}`** が作成されていること（`onAuthUserCreate`）
3. **課金**: Checkout 完了 → `billing.tickets` 加算、`stripeCustomerId` が `cus_...` になること
4. **添削**: ログイン状態で `/api/ops/run-proofread` 相当の操作が、チケットと権限どおりに動くこと
5. **管理者**: `/admin` 系・返金・手動チケット調整が **`ADMIN_UIDS` と一致する UID** だけで通ること

---

## 7. トラブル時

- Functions デプロイ: `functions/DEPLOY-NOTES.txt`（`gcf-sources` 権限など）
- ルール・Functions の詳細: `docs/deploy-nexus0101-functions.md`
- 提出データ・レプリカ・Day4: `docs/DEPLOYMENT.md`

---

## 0101「完全」と本番の差分（意図的）

- Stripe は **テストモード**、Webhook も検証 URL
- 本番 `nexus0301` へ移すときは **プロジェクト ID・キー・Webhook URL・Cloud Run の env をすべて差し替え**（取り違え防止）
