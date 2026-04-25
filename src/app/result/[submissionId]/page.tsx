import Link from "next/link";

import { StudentResultAudioControls } from "@/components/StudentResultAudioControls";
import { StudentResultViewBeacon } from "@/components/StudentResultViewBeacon";
import { StudentResultPrintActions } from "@/components/StudentResultPrintActions";
import { studentExplanationToDisplayHtml } from "@/lib/explanation-display-html";
import { finalEssayHtmlPlainBlack } from "@/lib/final-essay-diff-html";
import { formatDateTimeIso } from "@/lib/format-date";
import { resolveFinalEssayForStudentDisplay } from "@/lib/student-final-essay-display";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { formatRubricEvaluationInline } from "@/lib/task-problems-core";
import { getSubmissionById } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ submissionId: string }> };

function hrefForAudioUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("/")) return u;
  return `/${u.replace(/^\/+/, "")}`;
}

export default async function StudentResultPage({ params }: Props) {
  const { submissionId } = await params;
  const submission = await getSubmissionById(submissionId);

  if (!submission) {
    return (
      <main>
        <h1>添削結果</h1>
        <p>該当する提出が見つかりませんでした。</p>
        <p>
          <Link href="/submit">提出画面へ</Link>
        </p>
      </main>
    );
  }

  const sr = submission.studentRelease;
  if (!sr?.operatorApprovedAt) {
    return (
      <main>
        <h1>添削結果</h1>
        <p>
          この提出は<strong>運用からまだ公開されていません</strong>。公開後に同じ URL
          でご確認ください。
        </p>
        <p className="muted">受付番号: {submission.submissionId}</p>
        <p>
          <Link href="/submit">提出画面へ</Link>
        </p>
      </main>
    );
  }

  const qrPath = submission.day4?.qr_path?.trim() ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";
  const audioUrl = String(submission.day4?.audio_url ?? "").trim();
  const audioSrc = audioUrl ? hrefForAudioUrl(audioUrl) : "";

  const explanationHtml = studentExplanationToDisplayHtml(sr.explanation ?? "");
  const { revised: finalRevised } = resolveFinalEssayForStudentDisplay({
    essayText: submission.essayText,
    studentReleaseFinalText: sr.finalText,
    proofread: submission.proofread,
  });
  const finalEssayHtml = finalEssayHtmlPlainBlack(finalRevised);

  const taskMaster = await loadTaskProblemsMaster(submission.taskId);
  const scoreInline = taskMaster
    ? formatRubricEvaluationInline(taskMaster, sr.scores ?? {}, sr.scoreTotal)
    : null;

  return (
    <main className="student-result-page">
      <StudentResultViewBeacon submissionId={submission.submissionId} />
      <h1>添削結果（確定版）</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {submission.studentName} さん / taskId: {submission.taskId} / 公開日時:{" "}
        {formatDateTimeIso(sr.operatorApprovedAt)}
      </p>

      <StudentResultPrintActions />

      <div className="card student-result-card">
        <h2 className="student-result-section-title">得点・評価</h2>
        {scoreInline ? (
          <p className="student-result-score-line">{scoreInline}</p>
        ) : (
          <>
            <p className="student-result-score-line">合計: {sr.scoreTotal}点</p>
            <pre className="student-result-pre">{sr.evaluation}</pre>
          </>
        )}
      </div>

      <div className="card student-result-card">
        <h2 className="student-result-section-title">解説</h2>
        <div
          className="student-explanation-html-wrap"
          lang="ja"
          dangerouslySetInnerHTML={{ __html: explanationHtml }}
        />
      </div>

      <div className="card student-result-card student-result-card--essay">
        <h2 className="student-result-section-title">完成版</h2>
        <div className="essay-final-diff" dangerouslySetInnerHTML={{ __html: finalEssayHtml }} />
        {audioSrc ? <StudentResultAudioControls src={audioSrc} /> : null}
      </div>

      {qrSrc ? (
        <div className="card student-result-card">
          <h2 className="student-result-section-title">音声（スマホ用 QR）</h2>
          <p className="muted student-result-qr-lead">
            音声には再生可能期限がありますのでダウンロードして保存してください。
          </p>
          <div className="student-result-qr-img-wrap">
            <img
              src={qrSrc}
              alt="音声への QR"
              width={220}
              height={220}
              className="student-result-qr-img"
            />
          </div>
          {audioUrl ? (
            <p className="student-result-qr-audio-link">
              同じ音声を PC のブラウザで聞く場合:{" "}
              <a href={hrefForAudioUrl(audioUrl)}>音声を開く</a>
            </p>
          ) : null}
          <p className="muted student-result-qr-foot">
            開いた先はページではなく <strong>mp3 ファイル</strong>です。再生ボタン（▶）を押すか、ダウンロードしてから聞いてください。
          </p>
        </div>
      ) : null}

      <p className="no-print">
        <Link href="/submit">提出画面へ戻る</Link>
        {" · "}
        <Link href="/">開発用トップ</Link>
      </p>
    </main>
  );
}
