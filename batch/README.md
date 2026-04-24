# Day3: Gemini proofreading batch

このバッチは `next-writing-batch/data/submissions.json` に書かれている提出データを読み込み、
`status: "pending"` のものだけ `Gemini` で添削し、`status: "done" | "failed"` と `proofread` 結果を書き戻します。

## 前提
- **Python**: `next-writing-batch` 内の venv を推奨。依存は **`./.venv/bin/python3 -m pip install -r requirements.txt`** とし、バッチも **`./.venv/bin/python3 batch/...`** で実行してください。システムの `python3`（例: `/usr/local/bin/python3`）だと `reportlab` 未導入で落ちることがあります。
- **まず動作確認**: ターミナルで `npm run check:setup`（または `./.venv/bin/python3 batch/check_setup.py`）。[OK] が並べば、このフォルダ単体で添削・音声の準備はできています（親フォルダの `nexus_project` は不要です）。
- `GEMINI_API_KEY` が環境変数として設定されていること（または運用画面で `data/gemini_api_key.txt` に保存、または `.env.local` で Next と共有）
- `next-writing-batch` 側で、生徒提出APIを使って `data/submissions.json` が作られていること（**試験だけ**なら `npm run seed:pending` または `batch/seed_pending_submission.py` で `pending` を1件追加可）

## 実行例
```bash
cd next-writing-batch
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 2026_spring_week1
```

## オプション
- `--limit N` : 最大N件だけ処理
- `--max-retries K` : Gemini呼び出しのリトライ回数

---

# Day4: TTS + QR + PDF（ローカル出力）

Day3で `status: "done"` になったデータ（`proofread.final_essay` が存在）を対象に、
ローカルへ `mp3` / `QR` / `PDF` を出力します。

出力先:
- `next-writing-batch/output/audio/{taskId}/{studentId}.mp3`
- `next-writing-batch/output/qr/{taskId}/{studentId}.png`
- `next-writing-batch/output/pdf/{taskId}/{studentId}_{studentName}.pdf`

QRに埋め込むURL:
- 環境変数 `GCS_BUCKET_NAME` が設定されている場合:
  - 音声mp3をGCSへアップロードし、GCSの署名付きURLをQRへ埋め込みます
  - 有効期限は `GCS_SIGNED_URL_EXPIRE_DAYS`（デフォルト `180`）です
  - 初回セットアップ後の接続確認: `./.venv/bin/python3 batch/verify_gcs_setup.py`（詳細は `batch/OPERATIONS_5MIN.md` の **0.5**）
- `GCS_BUCKET_NAME` が未設定の場合:
  - **ターミナルから直接**バッチを叩くときは `--allow-local-qr` が必要です（GCS 無しで相対 URL の QR を許可）。
  - **運用画面の「確定（Day4 生成）」から**叩くときは、`NODE_ENV` が本番以外かつ `GCS_BUCKET_NAME` が無ければ Next が **自動で `--allow-local-qr` を付けます**（`.env.example` 参照）。
  - `AUDIO_BASE_URL` があれば `.../output/audio/{taskId}/{studentId}.mp3`（例: `http://192.168.0.10:3001` — スマホからQRで試すときは PC の LAN IP + dev ポート）
  - 無ければ `/output/audio/...`（`npm run dev` 中は Next の `app/output/...` ルートで成果物を配信）

実行例:
```bash
cd next-writing-batch
./.venv/bin/python3 -m pip install -r requirements.txt
# GCS 未設定のローカル開発:
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 2026_spring_week1 --allow-local-qr
# GCS 設定済み:
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 2026_spring_week1
```

PDFの日本語表示には **Noto Sans JP（TrueType）** が必要です。デフォルトでは初回実行時に `batch/fonts/NotoSansJP-Variable.ttf` へダウンロードします（`.gitignore` 対象のためリポジトリには含みません）。オフラインでは同パスへ手で置くか、環境変数 **`DAY4_JP_FONT`** に別の `.ttf` の絶対パスを指定してください。

---

# 納品ZIP（任意）

`output/audio/{taskId}/`・`output/qr/{taskId}/`・`output/pdf/{taskId}/` をまとめて ZIP 化します（ZIP 内は `{taskId}/audio/...` など）。

```bash
cd next-writing-batch
./.venv/bin/python3 batch/package_task_outputs.py --task-id 2026_spring_week1
```

出力先（デフォルト）:
- `next-writing-batch/output/zips/{taskId}.zip`

---

# Day6〜7: 並列・再実行・運用

- **通し実行（計測付き）**: `./.venv/bin/python3 batch/run_sprint_pipeline.py --task-id <taskId> --day3-workers 6 --day4-workers 6 --zip`
- **5分運用手順・セキュリティ**: `batch/OPERATIONS_5MIN.md`
- **管理UI**: `http://localhost:3000/ops`（バッチはターミナル実行）

