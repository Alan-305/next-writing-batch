# 運用マニュアル（約5分）

この手順で **提出 → 添削 → 音声/GCS/QR/PDF → ZIP納品** まで再現できます。作業ディレクトリは常に `next-writing-batch` です。

## 0. 事前準備（初回のみ）

1. **作業ディレクトリ**: リポジトリの `next-writing-batch` フォルダ（すでにその中にいる場合は `cd` は不要）。  
2. **Python**: 次のどちらかで **同じインタプリタ** に依存を入れて、バッチもそのインタプリタで実行してください（混在すると `ModuleNotFoundError: reportlab` になります）。

```bash
cd /path/to/next-writing-batch
./.venv/bin/python3 -m pip install -r requirements.txt
# 以降の例はすべてこの Python を使う:
# ./.venv/bin/python3 batch/run_day3_proofread.py ...
```

（`source .venv/bin/activate` 後に `python3` だけ使う方法でも可。）

**よくあるミス**: ターミナルで `python3` が `/usr/local/bin/python3` を指しているのに、`.venv` へ `pip install` だけした場合 — 実行も `./.venv/bin/python3` に揃えてください。

3. 環境変数（`.env` ではなくシェルで export する想定）  
   - **Day3**: `ANTHROPIC_API_KEY`  
   - **Day4（GCS）**: `GCS_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS`（サービスアカウントJSONのパス）  
   - **署名URL**: `GCS_SIGNED_URL_EXPIRE_DAYS`（省略時 **180** 日）  
   - GCS を初めて使う場合のコンソール手順は **「0.5 GCS 初回セットアップ」** を参照してください。
4. 生徒画面・管理画面: `npm install && npm run dev`（別ターミナル）  
   - スマホから **LAN の IP（例 `192.168.x.x:3001`）** で開くには、開発サーバーが **`0.0.0.0` で待ち受け**る必要があります（本プロジェクトの `npm run dev` は既にそうなっています）。  
   - まだ繋がらない場合は **macOS のファイアウォール**で Node が受信許可されているか確認してください。

## 0.5 GCS 初回セットアップ（Day4・署名付きURL）

[Google Cloud コンソール](https://console.cloud.google.com/) で次を実施します（初回のみ）。

1. **プロジェクト**を作成（または既存を選択）し、**請求先**を紐づける。  
2. **Cloud Storage** → **バケットを作成**。名前は全世界で一意。  
   - **公開アクセスは付与しない**（「公開」チェックは入れない）。均一なバケットレベルのアクセス制御で問題ありません。  
   - リージョンは用途に合わせて選択（例: 日本向けなら `asia-northeast1`）。Always Free の条件を使う場合は [料金の注記](https://cloud.google.com/storage/pricing#cloud-storage-always-free) に沿ったリージョンを選んでください。  
3. **IAM と管理** → **サービスアカウント** → **サービスアカウントを作成**（名前は任意。例: `writing-batch-day4`）。  
4. 作成したサービスアカウントの **キー** タブで **鍵を追加** → **JSON を作成**し、ダウンロードしたファイルを **リポジトリ外の安全なパス** に保存する（例: `~/.config/gcp/nexus-day4.json`）。  
5. **バケットの権限**（バケット詳細 → **権限**）で、そのサービスアカウントに **「ストレージ オブジェクト管理者」**（`roles/storage.objectAdmin`）を付与する（**このバケットにのみ**付与すると他と分離しやすい）。  
   - アップロード・削除・署名付きURL生成（クライアントが JSON 内の秘密鍵で署名）に必要な範囲です。  
6. ターミナルで環境変数を設定する（パスは自分の環境に合わせる）:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/gcp/nexus-day4.json"
export GCS_BUCKET_NAME="あなたのバケット名"
export GCS_SIGNED_URL_EXPIRE_DAYS=180   # 任意
```

7. **接続確認**（テスト用オブジェクトを 1 件アップロードしてから削除します）:

```bash
cd /path/to/next-writing-batch
./.venv/bin/python3 batch/verify_gcs_setup.py
# バケット名や鍵だけ一時的に上書きする例:
# ./.venv/bin/python3 batch/verify_gcs_setup.py --bucket my-bucket --credentials "$HOME/.config/gcp/key.json"
# 外向き HTTPS が使えない環境では署名URLの実 GET を省略:
# ./.venv/bin/python3 batch/verify_gcs_setup.py --no-fetch
```

`GCS 接続確認: OK` を含む行（既定では **HTTP GET まで**検証）が出れば Day4 バッチの GCS 部分に進めます。失敗時は **403** なら IAM、**404** ならバケット名、鍵パスが間違っていないかを確認してください。GET まで失敗する場合はプロキシ・ファイアウォールを確認するか `--no-fetch` で署名生成のみ確認してください。

その後、通常どおり **3. Day4** の `./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py ...` を実行します。

### よくあるエラー（ターミナル）

| 症状 | 対処 |
|------|------|
| `localStorage.getItem is not a function`（Next のターミナル） | Node の **`--localstorage-file` 設定ミス**でサーバー側の `localStorage` が壊れていることが多い。プロジェクト側で **`src/lib/fix-node-localstorage.ts`** により SSR 時は安全なスタブに差し替え済み。警告が出ても **ページは表示できる**はず。根本対応: `npm config get node-options` と **`~/.npmrc` の `node-options`** を確認し、`--localstorage-file` をやめるか正しいパスを付ける。 |
| `ModuleNotFoundError: No module named 'reportlab'` | バッチを **`./.venv/bin/python3`** で実行するか、その `python3` で `pip install -r requirements.txt` 済みか確認。 |
| `[day3] targets=0` | `data/submissions.json` に `status=pending` が無い、または `--task-id` が提出の **taskId と一致していない**。プレースホルダ `YOUR_TASK` のままでは動きません。**実際の taskId** を指定するか、全件対象なら `--task-id` を付けない。 |
| `cd: no such file or directory: next-writing-batch` | すでに `next-writing-batch` 内にいる。`cd` はスキップ。 |
| `task output folder not found: .../output/YOUR_TASK` | Day4 がまだ成功しておらず `output/<taskId>/` が無い。上記のとおり **taskId とデータ** を直し、Day4 成功後に ZIP。 |
| `verify_gcs_setup.py` が 403 / アップロード失敗 | バケット IAM にサービスアカウントの **`roles/storage.objectAdmin`**（または同等のオブジェクト作成・削除）が付いているか、**`GOOGLE_APPLICATION_CREDENTIALS`** がその SA の JSON を指しているか確認。 |
| 署名URLの **GET だけ**失敗（アップロードは成功） | 端末から `storage.googleapis.com` への **外向き HTTPS** がブロックされていないか確認。必要なら **`--no-fetch`** で署名生成までのみ検証。 |

## 1. 生徒提出（手修正つき）

**（任意）コマンドだけでテスト提出を1件足す**（`pending`）:

```bash
cd next-writing-batch
npm run seed:pending
# または ./.venv/bin/python3 batch/seed_pending_submission.py --task-id 実際のtaskId
```

1. ブラウザで `http://localhost:3000/submit` を開く  
2. **taskId**（課題ID）、学籍ID、氏名、英文を入力して送信  
3. 管理の **提出一覧** で `status=pending` になっていることを確認  

## 2. Day3: Claude 添削バッチ

```bash
cd next-writing-batch   # 既にいるなら不要
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 実際のtaskId --workers 6
# taskId で絞らない（全 pending）: --task-id を省略
```

- **進捗**: 標準出力に `done / failed / remain / elapsed_s` が出ます。  
- **全体停止なし**: 1件失敗しても他は続行し、`submissions.json` に都度書き戻します。  
- **失敗分だけ再実行**:

```bash
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 実際のtaskId --workers 6 --retry-failed
```

- **特定IDだけ**（カンマ区切り）:

```bash
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 実際のtaskId --submission-ids uuid1,uuid2
```

## 3. Day4: TTS + GCS + 署名URL + QR + PDF

```bash
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 実際のtaskId --workers 6
```

- **オブジェクトキー**: `audio/{taskId}/{studentId}.mp3`（固定ルール）  
- **QR**: 署名付きURL（または `AUDIO_BASE_URL` ベースの公開URL）を埋め込み  
- **ローカルでスマホからQR試験（GCSなし）**: `npm run dev` のターミナルに出る **Network の URL**（例 `http://192.168.x.x:3001`）を控え、Day4 の前に  
  `export AUDIO_BASE_URL=http://192.168.x.x:3001`  
  を設定してから Day4 を実行すると、QR に **LAN から届く音声URL** が入ります（同一 Wi‑Fi のスマホで再生可）。  
  開発サーバーは `/output/...` を内部で成果物フォルダから配信します。  
- **完了済みを飛ばす**: デフォルトで `pdf_path` がありエラーが無い行はスキップ  
- **再生成**: `--force`  
- **Day4の失敗・未生成だけ**:

```bash
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 実際のtaskId --workers 6 --only-day4-failed
```

- **PDFの日本語（氏名・添削文など）**: ReportLab 用に **Noto Sans JP（可変TTF）** を使います。初回は `batch/fonts/NotoSansJP-Variable.ttf` へ自動取得するため **ネットワーク必須**（取得後は同パスを再利用）。オフラインやプロキシ環境では、同ファイルを手置きするか、**`DAY4_JP_FONT`** に別の日本語対応 `.ttf` の絶対パスを指定してください（詳細はエラーメッセージ参照）。

## 4. 通し試験（100件想定）

```bash
./.venv/bin/python3 batch/run_sprint_pipeline.py --task-id 実際のtaskId --day3-workers 6 --day4-workers 6 --zip
```

終了時に **合計秒** が表示されます。目標時間はネットワークとAPI制限に依存するため、まず10件で `elapsed_s` を記録し、100件はその10倍程度を初期目安にしてください。

## 5. 納品ZIP（教員へ渡す）

```bash
./.venv/bin/python3 batch/package_task_outputs.py --task-id 実際のtaskId
# → output/zips/<taskId>.zip
```

開発サーバー起動中なら、ブラウザの **`/ops/deliverables`** からも ZIP をダウンロードできます。

## 作業を終了するとき

1. **開発サーバー** … 動かしているターミナルで **Ctrl+C**。止まらない／別ターミナルで掴んでいるときは、プロジェクトで次を実行:  
   `npm run dev:stop`  
   （ポート **3000 / 3001 / 3010** で待ち受けているプロセスを終了します。**他のアプリが同じポートを使っているとそれも止まる**ので注意してください。）
2. **ブラウザ** … タブを閉じる。
3. **APIキー** … `export` だけの場合はターミナルを閉じれば消えます。
4. **コミット** … コードはコミット可。`output/` と `data/submissions.json` は `.gitignore` 済み（成果物・提出データは基本 Git に含めない）。

## セキュリティ最終確認（リリース前チェック）

| 項目 | 確認内容 |
|------|-----------|
| 提出コード | 生徒画面はローカルMVP想定。本番では認証・レート制限・HTTPSを別途設計する。 |
| 署名URL | 期限（`GCS_SIGNED_URL_EXPIRE_DAYS`）と配布経路（PDF内QRのみ等）を運用で固定する。 |
| バケット | **一覧公開にしない**。オブジェクトは必要最小権限（アップロード＋署名URL生成）に留める。 |
| 鍵 | `GOOGLE_APPLICATION_CREDENTIALS` をリポジトリに含めない。CI/本番はシークレット管理。 |
| `submissions.json` | 個人情報を含む。Git管理外・バックアップ範囲を決める。 |

## トラブル時の優先順位（スプリント合意）

1. **処理を止めない**（失敗は記録し、残りを進める）  
2. **失敗IDだけ再実行できる**（`--retry-failed` / `--only-day4-failed` / `--submission-ids`）  
3. 見た目の調整はその後  
