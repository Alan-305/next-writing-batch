# nexus0301 試験運用（仕様 1〜7 と実装チェック）

課金（Stripe）実装の**手前**まで、本番 Firebase **`nexus0301`** で試すときの整理です。  
ここでの **「1〜7」** は `batch/OPERATIONS_5MIN.md` の GCS 手順番号ではなく、次の**区分**を指します（表記ゆれ禁止・`nexusproject` / `next-writing-batch` は独立アプリ）。

---

## 仕様 1〜7（固定）

### 1. プロダクト

- **`nexusproject` / `next-writing-batch`**（表記ゆれを固定し、独立したアプリとして扱う）。

### 2. Firebase プロジェクト

- **本番**: **`nexus0301`**（独立した 2 アプリをこの 1 プロジェクトで統合管理）。
- **開発・検証**: **`nexus0101`**（両アプリの共通テスト環境）。
- **Emulator**: ローカル開発時は**原則 Emulator**を使用。

### 3. フロントと接続

- **Next.js 各リポジトリ**: 環境変数（**`.env.local`**）で Firebase 設定を注入。**GitHub 等に絶対コミットしない**。
- **本番デプロイ（Cloud Run）**: 本番用 env。ローカルは開発用 **または Emulator** を自動で切り替える。

### 4. Authentication

- **主**: Google ログインのみ。
- **認証のゲート**: ホームページは一般公開。解答・入力作業画面（**`/input` 等**）に遷移する時点で Google 認証を求める。
- **Admin SDK**: **サーバー側（Functions 等）のみ**で使用。

### 5. データモデル（Firestore）

- **ユーザー主キー**: Auth の **`uid`**。
- **保存内容**: 添削設定（JSON）、生徒の回答、AI の添削結果はすべて **`uid` に紐付けて**永続保存。
- **アナリティクス**: 課題 ID ごとの点数分布、間違いが多い箇所、生徒の具体例・理由の種類をデータ化。サポート内容もデータ化し改善資料とする。
- **プロダクト ID（固定）**: **`next-writing-batch` / `nexusproject`**。
- **権利（Entitlements）**: `users/{uid}/entitlements/{productId}` でアプリごとの利用可否。
  - 初期 **`status`**: `none` / `active`（後から拡張）。
  - 将来用（null 可）: `source`, `expiresAt`, `organizationId` など。
- **組織**: `organizations/{orgId}`。ユーザーは 1 組織に紐付け（**`organizationId`**）。

### 6. プロジェクト横断

- **同一 `uid`**: アプリが別でも同じ `uid`。アクセスは **`entitlements`** で制御。
- **ドキュメント ID**: 課題・提出は**自動 ID（`addDoc`）**。マスタ ID（例: `2026`）と混同しない。

### 7. ロール・権限

- **初期**: 一般ユーザーと **`admin`**（管理者は松尾さん 1 名のみ）。
- **管理者識別**: 特定 **`uid` の allowlist** で松尾さん本人を識別。
- **拡張性**: 将来の **`teacher` / `grader`** のため、**`roles` は配列**で持つ。

---

## nexus0301 試験で揃える作業（仕様との対応）

| 区分 | 試験運用で確認すること |
|------|------------------------|
| **1** | UI・ドキュメントで表記を **`nexusproject` / `next-writing-batch`** に統一（別名を増やさない）。コード上の product ID は `src/lib/constants/nexus-products.ts` 等と一致させる。 |
| **2** | `.firebaserc` の **`production`** を Console の本番プロジェクト ID に合わせる（例: `nexus0301`）。検証は `default` の **`nexus0101`** 系のまま。ローカルは **`NEXT_PUBLIC_FIREBASE_USE_EMULATOR=true`** で Emulator 起動（`npm run firebase:emulators`）を原則に。 |
| **3** | 0301 向け **`NEXT_PUBLIC_FIREBASE_*`** を本番用に設定（Cloud Run のシークレット / ローカル用 `.env.local` は Git 対象外）。ビルドや起動時に **本番 / 検証 / Emulator** が取り違えられないようにする。 |
| **4** | **Google のみ**。要認証ルート（例: `/submit`, `/result`, `/ops`）は **`RequireAuth`**。ホーム・案内は公開。クライアントに Admin SDK を置かない。 |
| **5** | Functions の **`onAuthUserCreate`** で `users/{uid}`・`entitlements/{productId}`・`billing: {}` を作成済みであること。ルールは `firestore.rules` を 0301 にデプロイ。**`organizations`** コレクションとルール拡張は未着手なら、試験範囲で合意しておく。 |
| **6** | 提出・課題マスタの ID 運用を運用ドキュメントどおりに（自動 ID とマスタ年の混同防止）。 |
| **7** | **`NEXT_PUBLIC_FIREBASE_ADMIN_UIDS`** に管理者 `uid`。`roles` は配列で Firestore に保持（初期は `[]` でも可）。**`teacher` / `grader` ゲート**は後続でもよい。 |

### デプロイコマンド例（本番エイリアス）

```bash
npm run firebase:deploy-rules:prod
npm run firebase:deploy-functions:prod
```

（初回は `firebase login`、Blaze、Functions の `RESEND_API_KEY` 等を Cloud Console で設定。）

---

## 参考（仕様 1〜7 の外：運用・インフラ）

- **GCS / Day4**: `batch/OPERATIONS_5MIN.md` §0.5（手順 1〜7）は **ストレージ接続**の話です。本番 GCP でバケットを使う場合は **0301 と同じプロジェクト**に合わせ、`verify_gcs_setup.py` まで通してください。
- **ホスティング**: `docs/DEPLOYMENT.md`（`data/`・`output/`、レプリカ数）。

---

**0101 → 0301 切替時**は、ブラウザが指す **`NEXT_PUBLIC_FIREBASE_PROJECT_ID`** と Firebase Console のプロジェクトが一致しているか必ず確認してください。
