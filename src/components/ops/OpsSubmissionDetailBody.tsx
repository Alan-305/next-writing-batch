import Link from "next/link";

import { OpsSubmissionTaskIdEditor } from "@/components/OpsSubmissionTaskIdEditor";
import { StudentReleaseEditor } from "@/components/StudentReleaseEditor";
import { formatDateTimeIso } from "@/lib/format-date";
import { submissionProofreadTaskMismatch } from "@/lib/submission-proofread-task-mismatch";
import type { Submission } from "@/lib/submissions-store";
import type { TaskProblemsMaster } from "@/lib/task-problems-core";

type Props = {
  submission: Submission;
  master: TaskProblemsMaster | null;
  taskRubricDefaults: Record<string, number>;
  teacherSetupDefaults: Record<string, number>;
};

export function OpsSubmissionDetailBody({
  submission,
  master,
  taskRubricDefaults,
  teacherSetupDefaults,
}: Props) {
  const day4 = submission.day4;
  const hasDay4Pdf = Boolean(String(day4?.pdf_path ?? "").trim()) && !day4?.error;
  const day4Error = day4?.error;

  const qrPath = submission.day4?.qr_path ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";

  const published = Boolean(submission.studentRelease?.operatorApprovedAt);
  const taskMismatch = submissionProofreadTaskMismatch(submission);

  return (
    <main>
      <h1>提出詳細</h1>
      <p>
        <Link href="/ops/submissions">一覧に戻る</Link>
      </p>

      <div className="card">
        {taskMismatch.mismatched ? (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              background: "#fef3c7",
              border: "1px solid #f59e0b",
              borderRadius: 8,
              color: "#78350f",
            }}
          >
            <strong>課題IDと添削結果の不一致</strong>
            <p style={{ margin: "8px 0 0", fontSize: "0.95rem" }}>
              現在の課題IDは <code>{submission.taskId}</code> ですが、この添削結果は{" "}
              <code>{taskMismatch.sourceTaskId}</code> のときに生成されています。正しい課題で再度 AI
              添削する場合は、下で課題IDを保存したうえで、提出一覧へ戻り「添削やり直し」を実行してください。再添削が完了すると、以前の AI
              添削結果は新しい結果で置き換わります。
            </p>
          </div>
        ) : null}
        <OpsSubmissionTaskIdEditor
          key={submission.taskId}
          submissionId={submission.submissionId}
          initialTaskId={submission.taskId}
          disabled={published}
          disabledReason={published ? "生徒向け公開済みのため課題IDは変更できません。" : undefined}
        />
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

      <div className="card ops-submission-original-essay">
        <h2>原文</h2>
        {submission.essayMultipart && submission.essayParts && submission.essayParts.length > 0 ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              複数設問提出（<code>essayMultipart</code>）。設問ごとの入力値：
            </p>
            {submission.essayParts.map((part, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>Question {i + 1}</p>
                <pre>{part}</pre>
              </div>
            ))}
            <p className="muted" style={{ marginBottom: 6 }}>
              添削プロンプトへ渡した結合テキスト（<code>essayText</code>）：
            </p>
            <pre>{submission.essayText}</pre>
          </>
        ) : (
          <pre>{submission.essayText}</pre>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 6 }}>修正入力</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          修正の必要がある場合のみ、内容を変更してください。
        </p>
        {published && submission.studentRelease ? (
          <p className="success" style={{ marginTop: 0, marginBottom: 12 }}>
            生徒向け公開済み（{formatDateTimeIso(submission.studentRelease.operatorApprovedAt ?? "")}）— 合計{" "}
            {submission.studentRelease.scoreTotal}点 —{" "}
            <Link href={`/result/${encodeURIComponent(submission.submissionId)}`}>生徒向けページ</Link>
          </p>
        ) : null}
        {submission.studentRelease?.operatorFinalizedAt &&
        !submission.studentRelease?.operatorApprovedAt ? (
          day4Error ? (
            <p style={{ marginTop: 0, marginBottom: 12, color: "#b45309" }}>
              運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
              ）— 文面は固定済みですが、<strong>下の「成果物（Day4）」でエラー</strong>のため PDF
              がありません。公開には Day4 の成功が必要です。修正入力の{" "}
              <strong>Day4 だけ再生成</strong>（確定日時は変えません）か「確定（Day4
              生成）」の再実行、ログ確認のうえ失敗分のみ再実行してください。
            </p>
          ) : (
            <p style={{ marginTop: 0, marginBottom: 12, color: "#a16207" }}>
              運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
              ）— Day4 用の文面が固定されています。PDF ができたら「生徒に公開する」が押せます。
            </p>
          )
        ) : null}
        {master ? (
          <StudentReleaseEditor
            key={`${submission.submissionId}-${submission.status}-${submission.proofread?.finishedAt ?? submission.proofread?.generated_at ?? ""}`}
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
            課題マスタがありません（テナント配下の <code>task-problems/{submission.taskId}.json</code>
            ）。配置後にルーブリック編集が使えます。
          </p>
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
