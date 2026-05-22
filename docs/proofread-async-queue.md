# 非同期添削キュー（Phase 1）

## 概要

- **預ける** … 教師がキュー投入 → **即 202 返却**（1 提出 = 1 ジョブ）
- **今すぐ** … 同期 `/api/ops/run-proofread`（完了まで待つ）
- **Cloud Tasks** が `/api/internal/process-proofread` を呼び、Claude 添削を 1 件実行
- 結果は **Firestore** に反映（提出一覧は queued/processing 中 5 秒ごとに自動更新）
- **メール**（Resend）: 預けた教師（`requestedByUid`）のみ。全件完了時に1通 + 約1時間ごとに途中経過

## 前提

- **1 テナント = 1 教師**（同一テナント内の複数教師同時添削は想定しない）
- **別テナント**の同時添削はキュー + ワーカー並列（max 5 同時 dispatch 既定）で処理

## ローカル開発

`.env.local` に追加:

```bash
NWB_PROOFREAD_INLINE=true
NWB_PROOFREAD_WORKER_SECRET=local-dev-change-me-32chars-min
NEXT_WRITING_BATCH_KEY=sk-ant-...
```

`npm run dev` 起動後、提出一覧から「添削」。enqueue 後に同一プロセス内で非同期処理されます。

## 本番（Cloud Run + Cloud Tasks）

1. キュー作成:

```bash
PROJECT_ID=nexus0101-35b17 ./scripts/setup-proofread-cloud-tasks.sh
```

2. Cloud Run 環境変数（Secret Manager 推奨）:

| 変数 | 説明 |
|------|------|
| `NWB_PROOFREAD_WORKER_SECRET` | ワーカー API 認証（ランダム長文字列） |
| `NWB_PROOFREAD_WORKER_URL` | サービス URL（例 `https://next-writing-batch-xxx.run.app`） |
| `NWB_CLOUD_TASKS_QUEUE` | `proofread-jobs` |
| `NWB_CLOUD_TASKS_LOCATION` | `asia-northeast1` |
| `GCP_PROJECT_ID` | Firebase プロジェクト ID |

3. Cloud Run サービスアカウントに **Cloud Tasks Enqueuer** と **Cloud Tasks 実行用の invoker** 権限を付与

4. Cloud Tasks が HTTP POST するとき、ヘッダ `X-Proofread-Worker-Secret` に秘密を付与（アプリ側で検証）

## API

| エンドポイント | 用途 |
|----------------|------|
| `POST /api/ops/enqueue-proofread` | 教師: キューに預ける |
| `POST /api/ops/run-proofread` | 教師: 今すぐ同期実行 |
| `POST /api/internal/process-proofread` | ワーカー: 1 件処理 |

## status 遷移

`pending` → `queued` → `processing` → `done` | `failed`
