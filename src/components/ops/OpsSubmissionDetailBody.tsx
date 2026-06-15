import Link from "next/link";

import { OpsSubmissionTaskIdEditor } from "@/components/OpsSubmissionTaskIdEditor";
import { StudentReleaseEditor } from "@/components/StudentReleaseEditor";
import { formatDateTimeIso } from "@/lib/format-date";
import { studentReceiveMethodLabel } from "@/lib/student-receive-method";
import { submissionProofreadTaskMismatch } from "@/lib/submission-proofread-task-mismatch";
import type { Submission } from "@/lib/submissions-store";
import type { TaskProblemsMaster } from "@/lib/task-problems-core";

type Props = {
  submission: Submission;
  master: TaskProblemsMaster | null;
  taskRubricDefaults: Record<string, number>;
  teacherSetupDefaults: Record<string, number>;
  onReloadComplete?: (scrollToId?: string) => void;
};

export function OpsSubmissionDetailBody({
  submission,
  master,
  taskRubricDefaults,
  teacherSetupDefaults,
  onReloadComplete,
}: Props) {
  const day4 = submission.day4;
  const hasDeliverablePdf = Boolean(String(day4?.pdf_path ?? "").trim()) && !day4?.error;
  const deliverableError = day4?.error;

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
          <b>studentName</b>（ニックネーム）: {submission.studentName}
        </p>
        {submission.redeemId ? (
          <p>
            <b>引換ID</b>: <code>{submission.redeemId}</code>
          </p>
        ) : null}
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
          修正の必要がある場合のみ、内容を変更してください。「生徒画面確認」で印刷用の見た目を確認できます。
        </p>
        {published && submission.studentRelease ? (
          <p className="success" style={{ marginTop: 0, marginBottom: 12 }}>
            生徒向け公開済み（{formatDateTimeIso(submission.studentRelease.operatorApprovedAt ?? "")}）— 合計{" "}
            {submission.studentRelease.scoreTotal}点 —{" "}
            <Link href={`/result/${encodeURIComponent(submission.submissionId)}`}>生徒向けページ</Link>
            {submission.studentReceiveMethod ? (
              <>
                {" "}
                — 受け取り: {studentReceiveMethodLabel(submission.studentReceiveMethod)}
                {submission.studentReceiveMethodAt
                  ? `（${formatDateTimeIso(submission.studentReceiveMethodAt)}）`
                  : ""}
              </>
            ) : (
              <> — 受け取り: 未選択</>
            )}
          </p>
        ) : null}
        {submission.studentRelease?.operatorFinalizedAt &&
        !submission.studentRelease?.operatorApprovedAt ? (
          deliverableError ? (
            <p style={{ marginTop: 0, marginBottom: 12, color: "#b45309" }}>
              運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
              ）— 文面は固定済みですが、PDF・音声の生成でエラーが発生しています。「確定＆公開」を再度お試しください。
            </p>
          ) : (
            <p style={{ marginTop: 0, marginBottom: 12, color: "#a16207" }}>
              運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
              ）— 未公開です。「確定＆公開」で生徒に返却できます。
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
            hasDay4Pdf={hasDeliverablePdf}
            day4Error={deliverableError}
            taskRubricDefaults={taskRubricDefaults}
            teacherSetupScoreDefaults={teacherSetupDefaults}
            onReloadComplete={onReloadComplete}
          />
        ) : (
          <p className="error">
            課題マスタがありません（テナント配下の <code>task-problems/{submission.taskId}.json</code>
            ）。配置後にルーブリック編集が使えます。
          </p>
        )}
      </div>
    </main>
  );
}
