import Link from "next/link";

import { OpsReviewSplitPane } from "@/components/ops/OpsReviewSplitPane";
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

function OriginalEssayPanel({ submission }: { submission: Submission }) {
  return (
    <div className="ops-review-original">
      {submission.essayMultipart && submission.essayParts && submission.essayParts.length > 0 ? (
        <>
          <p className="muted ops-review-original__note">複数設問提出です。</p>
          {submission.essayParts.map((part, i) => (
            <div key={i} className="ops-review-original__part">
              <p className="ops-review-original__part-label">Question {i + 1}</p>
              <pre className="ops-review-original__text">{part}</pre>
            </div>
          ))}
          <p className="muted ops-review-original__note">添削に渡した結合テキスト：</p>
          <pre className="ops-review-original__text">{submission.essayText}</pre>
        </>
      ) : (
        <pre className="ops-review-original__text">{submission.essayText}</pre>
      )}
    </div>
  );
}

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

  const leftPane = (
    <div className="ops-review-pane-inner">
      <h2 className="ops-review-pane__title">修正入力</h2>
      <p className="muted ops-review-pane__lead">
        修正が必要な箇所だけ編集してください。「確定＆公開」後は生徒画面が開きます。
      </p>

      {published && submission.studentRelease ? (
        <p className="success ops-review-status">
          生徒向け公開済み（{formatDateTimeIso(submission.studentRelease.operatorApprovedAt ?? "")}）— 合計{" "}
          {submission.studentRelease.scoreTotal}点
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

      {submission.studentRelease?.operatorFinalizedAt && !submission.studentRelease?.operatorApprovedAt ? (
        deliverableError ? (
          <p className="ops-review-status ops-review-status--warn">
            運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
            ）— PDF・音声の生成でエラーが発生しています。「確定＆公開」を再度お試しください。
          </p>
        ) : (
          <p className="ops-review-status ops-review-status--pending">
            運用<strong>確定</strong>済み（{formatDateTimeIso(submission.studentRelease.operatorFinalizedAt)}
            ）— 未公開です。「確定＆公開」で生徒に返却できます。
          </p>
        )
      ) : null}

      {master ? (
        <StudentReleaseEditor
          key={`${submission.submissionId}-${submission.status}-${submission.proofread?.finishedAt ?? submission.proofread?.generated_at ?? ""}-${submission.studentRelease?.operatorApprovedAt ?? ""}-${submission.studentRelease?.operatorFinalizedAt ?? ""}`}
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
  );

  const rightPane = (
    <div className="ops-review-pane-inner">
      <h2 className="ops-review-pane__title">提出情報・原文</h2>

      <dl className="ops-review-meta">
        <div className="ops-review-meta__row">
          <dt>課題ID</dt>
          <dd>
            <OpsSubmissionTaskIdEditor
              key={submission.taskId}
              submissionId={submission.submissionId}
              initialTaskId={submission.taskId}
              disabled={published}
              disabledReason={published ? "生徒向け公開済みのため課題IDは変更できません。" : undefined}
            />
          </dd>
        </div>
        <div className="ops-review-meta__row">
          <dt>ニックネーム</dt>
          <dd>{submission.studentName}</dd>
        </div>
        {submission.redeemId ? (
          <div className="ops-review-meta__row">
            <dt>引換ID</dt>
            <dd>
              <code className="ops-review-meta__code">{submission.redeemId}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      <h3 className="ops-review-pane__subtitle">あなたの解答（原文）</h3>
      <OriginalEssayPanel submission={submission} />
    </div>
  );

  return (
    <main className="ops-review-page">
      <header className="ops-review-page__header">
        <div>
          <h1>確認＆修正</h1>
          <p className="muted ops-review-page__sub">
            受付ID: <code>{submission.submissionId}</code>
          </p>
        </div>
        <Link href="/ops/submissions" className="ops-btn ops-btn--ghost ops-btn--compact">
          提出一覧へ
        </Link>
      </header>

      {taskMismatch.mismatched ? (
        <div className="ops-review-alert" role="alert">
          <strong>課題IDと添削結果の不一致</strong>
          <p>
            現在の課題IDは <code>{submission.taskId}</code> ですが、この添削結果は{" "}
            <code>{taskMismatch.sourceTaskId}</code> のときに生成されています。正しい課題で再度 AI
            添削する場合は、右側で課題IDを保存したうえで、提出一覧へ戻り「添削やり直し」を実行してください。
          </p>
        </div>
      ) : null}

      <OpsReviewSplitPane left={leftPane} right={rightPane} />
    </main>
  );
}
