# 本番デプロイで押さえること（提出データ・Day4）

## 今日すぐ Day4 を通したい（GCS まだ・試験運用）

1. **アプリはレプリカ1台**、または **`data/` と `output/` を永続ボリュームで共有**（複数台で共有なしだと添削・Day4 が別インスタンスに書き分けられ失敗します）。
2. ホストに **Python バッチ**が動くこと（Dockerfile 利用なら `PROOFREAD_PYTHON` 済み。それ以外は `.venv` か `PROOFREAD_PYTHON`）。
3. 環境変数（GCS なしのとき）:
   - **既定で QR は出ません**（追加の env は不要。音声は `/output/audio/...`）。絶対 URL にしたいときだけ **`AUDIO_BASE_URL=https://（公開ドメイン）`**（末尾スラッシュなし）。
   - **QR を付ける**: **`DAY4_ENABLE_QR=true`** に加え、**GCS** または **`DAY4_ALLOW_LOCAL_QR=true` + `AUDIO_BASE_URL`**。
4. 絶対 URL を使う場合、ブラウザで **`{AUDIO_BASE_URL}/output/audio/`** が 404 ではないこと（Next が `/output/...` を配信）。

本番で GCS を使うなら `GCS_BUCKET_NAME` と認証情報を設定し、`DAY4_ALLOW_LOCAL_QR` は外すか `false` にしてください。

---

このアプリは提出を **`data/submissions.json`**（サーバー上の1ファイル）に保存します。課題マスタは **`data/task-problems/{taskId}.json`** です。

## 複数レプリカ・非共有ディスク

コンテナや VM を **2台以上** にスケールし、**`data/` が共有されていない**と次が起きます。

- スマホのリクエストはサーバーAで `submissions.json` が更新されるが、PCのリクエストはサーバーBに届き **提出一覧に出ない／404「提出が見つかりません」**（下書き保存・課題ID変更など）
- デプロイや再起動で **ディスクが空に戻る** ホスティングでは、データが消える

**対処の例（いずれか）**

1. **アプリのレプリカを常に1台**にする（最も手早い）
2. **`data/` を全インスタンスで共有するボリューム**（NFS、ReadWriteMany PVC など）をマウントする
3. 長期的には **PostgreSQL 等へ提出データを移す**（コード変更が必要）

## 下書き保存が 422 のとき

`TASK_MASTER_MISSING` … 本番に **`data/task-problems/{課題ID}.json`** が無い。デプロイ成果物にマスタを含めるか、運用で同期してください。

## Day4（音声・QR・PDF）

運用画面の「確定（Day4 生成）」は **`batch/run_day4_tts_qr_pdf.py` を Python で起動**します。ホストに次が必要です。

- **`.venv`**（または環境変数 **`PROOFREAD_PYTHON`** で Python のパス）
- **`GCS_BUCKET_NAME`** などバッチが要求する環境変数（本番ではローカルQR用フラグに頼らない設計）
- 成果物の書き込み先（通常 **`output/`**）が **永続・共有**であること

サーバーレスだけの構成では、子プロセス＋長時間処理が制限されることが多いです。**常時起動の1台**や **ジョブ用ワーカー**を検討してください。
