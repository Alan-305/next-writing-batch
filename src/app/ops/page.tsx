import Link from "next/link";

export default function OpsHomePage() {
  return (
    <main>
      <h1>運用（管理）</h1>
      <p className="muted">
        課題ごとの <code>taskId</code> は提出画面で入力します。バッチはリポジトリの{" "}
        <code>batch/</code> から実行します（詳細は <code>batch/OPERATIONS_5MIN.md</code>）。
      </p>

      <div className="card">
        <h2>作業を終了するとき</h2>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
          <li>
            <code>npm run dev</code> のターミナルで <b>Ctrl+C</b>
          </li>
          <li>
            止まらない場合（別ターミナルで動かしているなど）:{" "}
            <code>npm run dev:stop</code> — ポート 3000 / 3001 / 3010 の待ち受けを終了
          </li>
          <li>ブラウザのタブを閉じる</li>
        </ol>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          <code>dev:stop</code> は同じポートを使う<strong>別アプリも止める</strong>ことがあります。他の作業中ならポート番号を確認してください。
        </p>
      </div>

      <div className="card">
        <h2>テストデータ（任意）</h2>
        <p className="muted">
          ブラウザで出さずに <code>pending</code> を1件足してバッチ試験できます。
        </p>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
{`npm run seed:pending
# 課題IDを変える:
./.venv/bin/python3 batch/seed_pending_submission.py --task-id あなたのtaskId`}
        </pre>
      </div>

      <div className="card">
        <h2>画面</h2>
        <ul>
          <li>
            <Link href="/submit">課題提出（生徒）</Link> — OCR後の手修正つきで送信
          </li>
          <li>
            <Link href="/ops/submissions">提出一覧</Link> — ステータス確認・詳細
          </li>
          <li>
            <Link href="/ops/proofreading-setup">課題・添削設定</Link> — 課題文の入力と JSON 保存（Nexus Learning 互換）
          </li>
          <li>
            <Link href="/ops/deliverables">納品ZIP</Link> — 一覧とダウンロード
          </li>
          <li>
            <Link href="/ops/gemini-key">Gemini API キー</Link> — 1回保存して添削・読み取りで使う（任意）
          </li>
        </ul>
      </div>

      <div className="card">
        <h2>バッチ（ターミナル）</h2>
        <p>プロジェクトルート <code>next-writing-batch</code> で実行:</p>
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
{`# プロジェクトの venv で実行（reportlab 等はここに入れる）
./.venv/bin/python3 -m pip install -r requirements.txt

# 添削（並列例）— YOUR_TASK は提出と同じ taskId に置き換え、または --task-id を省略
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 実際のtaskId --workers 6

# 失敗分のみ再実行
./.venv/bin/python3 batch/run_day3_proofread.py --task-id 実際のtaskId --workers 6 --retry-failed

# 音声・GCS・QR・PDF
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 実際のtaskId --workers 6

# Day4 失敗・未生成のみ
./.venv/bin/python3 batch/run_day4_tts_qr_pdf.py --task-id 実際のtaskId --workers 6 --only-day4-failed

# 通し + ZIP（納品）
./.venv/bin/python3 batch/run_sprint_pipeline.py --task-id 実際のtaskId --day3-workers 6 --day4-workers 6 --zip`}
        </pre>
      </div>

      <div className="card">
        <h2>スマホでQR試験（ローカル・GCSなし）</h2>
        <p className="muted">
          <code>npm run dev</code> は LAN から届くよう <code>0.0.0.0</code> で起動します。Day4 の前に{" "}
          <code>export AUDIO_BASE_URL=http://（ターミナル Network 表示の IP:ポート）</code> を設定し、
          同一 Wi‑Fi のスマホで QR を読んでください。繋がらないときは Mac の<strong>ファイアウォール</strong>で
          Node の受信を許可してください。
        </p>
      </div>

      <div className="card">
        <h2>納品ZIP</h2>
        <p>
          作成後は <Link href="/ops/deliverables">納品ZIP（ダウンロード）</Link> から取得できます。
        </p>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
{`./.venv/bin/python3 batch/package_task_outputs.py --task-id 実際のtaskId
# → output/zips/<taskId>.zip`}
        </pre>
      </div>

      <p>
        <Link href="/">トップへ</Link>
      </p>
    </main>
  );
}
