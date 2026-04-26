# Day3: Claude proofreading batch

このバッチは `next-writing-batch/data/submissions.json` に書かれている提出データを読み込み、
`status: "pending"` のものだけ `Claude` で添削し、`status: "done" | "failed"` と `proofread` 結果を書き戻します。

## 前提
- **Python**: `next-writing-batch` 内の venv を推奨。依存は **`./.venv/bin/python3 -m pip install -r requirements.txt`** とし、バッチも **`./.venv/bin/python3 batch/...`** で実行してください。システムの `python3`（例: `/usr/local/bin/python3`）だと `reportlab` 未導入で落ちることがあります。
- **まず動作確認**: ターミナルで `npm run check:setup`（または `./.venv/bin/python3 batch/check_setup.py`）。[OK] が並べば、このフォルダ単体で添削・音声の準備はできています（親フォルダの `nexus_project` は不要です）。
- `ANTHROPIC_API_KEY` が環境変数として設定されていること（または運用画面で `data/anthropic_api_key.txt` に保存、または `.env.local` で Next と共有）
- `next-writing-batch` 側で、生徒提出APIを使って `data/submissions.json` が作られていること（**試験だけ**なら `npm run seed:pending` または `batch/seed_pending_submission.py` で `pending` を1件追加可）

## 実行例
```bash
cd next-writing-batch
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 2026_spring_week1
```

## オプション
- `--limit N` : 最大N件だけ処理
- `--max-retries K` : Claude呼び出しのリトライ回数

---

# Day4: TTS + PDF（ローカル出力。QR は `--qr` 指定時のみ）

Day3で `status: "done"` になったデータ（`proofread.final_essay` が存在）を対象に、
ローカルへ `mp3` / `QR` / `PDF` を出力します。

出力先:
- `next-writing-batch/output/audio/{taskId}/{studentId}.mp3`
- `next-writing-batch/output/qr/{taskId}/{studentId}.png`
- `next-writing-batch/output/pdf/{taskId}/{studentId}_{studentName}.pdf`

音声の公開 URL（JSON の `audio_url`）と QR:
- **既定: QR は生成しません。** GCS なしでも音声 URL は `/output/audio/...`（または環境変数 `AUDIO_BASE_URL` 下）で進みます。
- **QR を付けるときだけ** `--qr` を付けます。その場合は `GCS_BUCKET_NAME` があるか、`--allow-local-qr`（相対・ローカル URL を QR に埋める）が必要です。
- GCS 利用時: 音声を GCS に上げ署名付き URL を QR に埋め込み（`GCS_SIGNED_URL_EXPIRE_DAYS` 既定 180）。確認: `./.venv/bin/python3 batch/verify_gcs_setup.py`（`batch/OPERATIONS_5MIN.md` **0.5**）
- **運用画面の「確定（Day4 生成）」**からは、`DAY4_ENABLE_QR=true` のときだけ `--qr` が付きます。それ以外は上記の既定（QR なし）です。

実行例:
```bash
cd next-writing-batch
./.venv/bin/python3 -m pip install -r requirements.txt
# GCS なし・QR なし（既定）:
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 2026_spring_week1
# GCS なしで QR も付ける（開発用）:
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 2026_spring_week1 --allow-local-qr --qr
# GCS 設定済みで QR 付き:
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 2026_spring_week1 --qr
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

