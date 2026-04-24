import Link from "next/link";

import { StudentReleaseEditor } from "@/components/StudentReleaseEditor";
import { formatDateTimeIso } from "@/lib/format-date";
import { getSubmissionById } from "@/lib/submissions-store";
import { formatExplanationForPublicView } from "@/lib/student-release";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { defaultScoresFromTeacherSetup } from "@/lib/build-rubric-scores-for-editor";
import { loadTaskRubricDefaultScores } from "@/lib/task-rubric-default-scores";
import { loadTeacherProofreadingSetup } from "@/lib/teacher-proofreading-setup-store";

type Props = {
  params: Promise<{ submissionId: string }>;
};

function decodeSubmissionIdParam(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  try {
    return decodeURIComponent(t).trim();
  } catch {
    return t;
  }
}

/** fs を使うストアを読むため Node 上で明示 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SubmissionDetailPage({ params }: Props) {
  const { submissionId: rawParam } = await params;
  const submissionId = decodeSubmissionIdParam(rawParam);
  const submission = submissionId ? await getSubmissionById(submissionId) : null;

  if (!submission) {
    return (
      <main>
        <h1>提出詳細</h1>
        <p>該当データが見つかりませんでした。</p>
        <p>
          <Link href="/ops/submissions">一覧に戻る</Link>
        </p>
      </main>
    );
  }

  const pr = submission.proofread;
  const [master, taskRubricDefaults, teacherSetupJson] = await Promise.all([
    loadTaskProblemsMaster(submission.taskId),
    loadTaskRubricDefaultScores(submission.taskId),
    loadTeacherProofreadingSetup(submission.taskId),
  ]);
  const teacherSetupDefaults =
    master && teacherSetupJson ? defaultScoresFromTeacherSetup(master, teacherSetupJson) : {};

  const day4 = submission.day4;
  const hasDay4Pdf = Boolean(String(day4?.pdf_path ?? "").trim()) && !day4?.error;
  const day4Error = day4?.error;

  const qrPath = submission.day4?.qr_path ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";

  return (
    <main>
      <h1>提出詳細</h1>
      <p>
        <Link href="/ops/submissions">一覧に戻る</Link>
      </p>

      <div className="card">
        <p>
          <b>taskId</b>: {submission.taskId}
        </p>
        <p>
          <b>studentId</b>: {submission.studentId}
        </p>
        <p>
          <b>studentName</b>: {submission.studentName}
        </p>
        <p>
          <b>submittedAt</b>: {formatDateTimeIso(submission.submittedAt)}
        </p>
        <p>
          <b>status</b>: {submission.status}
        </p>
        {submission.problemId ? (
          <p>
            <b>problemId</b>: {submission.problemId}
          </p>
        ) : null}
        {submission.problemMemo ? (
          <div style={{ marginTop: 12 }}>
            <b>問題メモ</b>
            <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{submission.problemMemo}</pre>
          </div>
        ) : null}
        {submission.question ? (
          <div style={{ marginTop: 12 }}>
            <b>課題文（データ上・レガシー）</b>
            <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{submission.question}</pre>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2>原文</h2>
        {submission.essayMultipart && submission.essayParts && submission.essayParts.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              複数設問提出（<code>essayMultipart</code>）。設問ごとの入力値：
            </p>
            {submission.essayParts.map((part, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Question {i + 1}</p>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{part}</pre>
              </div>
            ))}
            <p className="muted" style={{ marginBottom: 6 }}>
              添削プロンプトへ渡した結合テキスト（<code>essayText</code>）：
            </p>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{submission.essayText}</pre>
          </>
        ) : (
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{submission.essayText}</pre>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>修正入力</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          修正の必要がある場合のみ、内容を変更してください。
        </p>
        {submission.studentRelease?.operatorApprovedAt ? (
          <p className="success" style={{ marginTop: 0, marginBottom: 12 }}>
            生徒向け公開済み（{formatDateTimeIso(submission.studentRelease.operatorApprovedAt)}）— 合計{" "}
            {submission.studentRelease.scoreTotal}点 —{" "}
            <Link href={`/result/${encodeURIComponent(submission.submissionId)}`}>生徒向けページ</Link>
          </p>
        ) : null}
        {submission.studentRelease?.operatorFinalizedAt &&
        !submission.studentRelease?.operatorApprovedAt ? (
          <p style={{ marginTop: 0, marginBottom: 12, color: "#a16207" }}>
            運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
            ）— Day4 用の文面が固定されています。PDF ができたら「生徒に公開する」が押せます。
          </p>
        ) : null}
        {master ? (
          <StudentReleaseEditor
            key={submission.submissionId}
            submissionId={submission.submissionId}
            taskId={submission.taskId}
            master={master}
            initialRelease={submission.studentRelease}
            proofread={submission.proofread}
            status={submission.status}
            hasDay4Pdf={hasDay4Pdf}
            day4Error={day4Error}
            taskRubricDefaults={taskRubricDefaults}
            teacherSetupScoreDefaults={teacherSetupDefaults}
          />
        ) : (
          <p className="error">
            課題マスタがありません（<code>data/task-problems/{submission.taskId}.json</code>
            ）。配置後にルーブリック編集が使えます。
          </p>
        )}
      </div>

      <div className="card">
        <h2>添削結果</h2>
        {submission.status === "done" ? (
          <>
            {pr?.evaluation ? (
              <>
                <p>
                  <b>得点・評価</b>
                </p>
                <pre style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>{pr.evaluation}</pre>
                <p>
                  <b>全体コメント</b>
                </p>
                <pre style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>{pr.general_comment}</pre>
                <p>
                  <b>解説</b>
                </p>
                <pre style={{ whiteSpace: "pre-wrap", margin: "0 0 12px" }}>
                  {formatExplanationForPublicView(String(pr.explanation ?? ""))}
                </pre>
                {pr.final_version ? (
                  <>
                    <h3>完成版</h3>
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{pr.final_version}</pre>
                  </>
                ) : null}
                <h3>音読用英文</h3>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{pr?.final_essay}</pre>
              </>
            ) : (
              <>
                <p>
                  <b>line1</b>: {pr?.line1_feedback}
                </p>
                <p>
                  <b>line2</b>: {pr?.line2_improvement}
                </p>
                <p>
                  <b>line3</b>: {pr?.line3_next_action}
                </p>
                <h3>完成版英文</h3>
                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{pr?.final_essay}</pre>
              </>
            )}
            <p style={{ marginTop: 12 }}>
              <b>model</b>: {pr?.model_name} / <b>generated_at</b>: {pr?.generated_at}
            </p>
          </>
        ) : submission.status === "failed" ? (
          <>
            <p className="error">
              添削に失敗しました: {pr?.operator_message ?? pr?.error ?? "unknown"}
            </p>
            {(() => {
              const msg = `${pr?.operator_message ?? ""} ${pr?.error ?? ""}`;
              const likelyApiKey =
                /GEMINI|GOOGLE_API|API.?キー|API_KEY|ADC|環境変数|\.env\.local|export/i.test(msg);
              if (!likelyApiKey) return null;
              return (
                <p className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                  <strong>提出一覧の「添削」ボタン</strong>から実行した場合、キーは{" "}
                  <strong>Next.js を起動したときの環境</strong>だけが使われます。別のターミナルで{" "}
                  <code>export</code> しただけでは届きません。プロジェクト{" "}
                  <code>next-writing-batch/.env.local</code> に{" "}
                  <code>GEMINI_API_KEY=あなたのキー</code>（または <code>GOOGLE_API_KEY</code>
                  ）を1行で書き、<code>npm run dev</code> を<strong>一度停止して再起動</strong>
                  してから、もう一度「添削」を試してください。または{" "}
                  <Link href="/ops/gemini-key">運用の「Gemini API キー」画面</Link>
                  から保存すると <code>data/gemini_api_key.txt</code> に格納され、再起動なしで使えることがあります。
                </p>
              );
            })()}
          </>
        ) : (
          <p>まだ添削処理が完了していません。</p>
        )}
      </div>

      <div className="card">
        <h2>成果物（Day4）</h2>
        {submission.day4?.error ? (
          <p className="error">
            Day4でエラー: {submission.day4.operator_message ?? submission.day4.error}
          </p>
        ) : null}
        {submission.day4?.pdf_path ? (
          <>
            <p className="muted" style={{ marginBottom: 12 }}>
              スマホで試すときは、<strong>下の画像のQR</strong>（または PDF 右上のQR）を読み取ってください。
              Chrome の「このページのURLをQRで共有」など<strong>別のQR</strong>だと、トップページ（
              <code>/</code>）だけが開き<strong>音声は鳴りません</strong>。
            </p>
            {qrSrc ? (
              <div style={{ marginBottom: 12 }}>
                <p>
                  <b>QR（この画像をスキャン）</b>
                </p>
                <img
                  src={qrSrc}
                  alt="音声へのQR"
                  width={220}
                  height={220}
                  style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}
                />
                <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                  ファイル: <code>{submission.day4.qr_path}</code>
                </p>
              </div>
            ) : null}
            {submission.day4?.audio_url ? (
              <p style={{ wordBreak: "break-all" }}>
                <b>音声URL（QRに埋め込んだ文字列）</b>: {submission.day4.audio_url}
                {submission.day4.audio_url.startsWith("/") ? (
                  <>
                    {" "}
                    <a href={submission.day4.audio_url}>PCで開いて試聴</a>
                  </>
                ) : (
                  <>
                    {" "}
                    <a href={submission.day4.audio_url}>音声URLを開く</a>
                  </>
                )}
              </p>
            ) : null}
            <p className="muted" style={{ marginTop: 8 }}>
              音声URLは「サイトのページ」ではなく <strong>mp3 ファイル</strong>です。開くとブラウザ内蔵の再生画面になるか、
              ダウンロードされます（真っ黒や最小表示でも正常なことがあります）。
            </p>
            <p className="muted" style={{ marginTop: 8 }}>
              <strong>「このサイトへの接続は保護されていません」</strong>は、ローカル開発の{" "}
              <code>http://</code> ではよく出る表示です（パスワードを入力しないで、という意味）。
              ポップアップを閉じ、画面下部や中央の<strong>再生ボタン（▶）</strong>を押してください。それでも無音なら、
              アドレスバー右の<strong>更新（再読み込み）</strong>を試すか、リンクを長押しして<strong>別タブで開く</strong>／
              <strong>ダウンロード</strong>してから再生してください。
            </p>
            <p>
              <b>PDF</b>: {submission.day4.pdf_path}
            </p>
            {submission.day4?.generatedAt ? (
              <p>
                <b>generatedAt</b>: {submission.day4.generatedAt}
              </p>
            ) : null}
          </>
        ) : submission.status === "done" ? (
          submission.day4?.error ? null : (
            <p>Day4（音声/QR/PDF生成）まだ未実行です。</p>
          )
        ) : (
          <p>まずDay3を完了させてください。</p>
        )}
      </div>
    </main>
  );
}

