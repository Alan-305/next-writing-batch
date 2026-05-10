import type { ReactNode } from "react";

import { StudentResultAudioControls } from "@/components/StudentResultAudioControls";
import { StudentResultAudioQr } from "@/components/StudentResultAudioQr";
import { StudentResultViewBeacon } from "@/components/StudentResultViewBeacon";
import type { StudentResultPublishedModel } from "@/lib/student-result-published-view";

type Props = {
  model: StudentResultPublishedModel;
  /** /result のみ閲覧ビーコンを出す */
  showViewBeacon?: boolean;
  /** 見出し直下（印刷案内など） */
  topSlot?: ReactNode;
  /** メイン末尾（戻るリンクなど） */
  bottomSlot?: ReactNode;
};

export function StudentResultPublishedBody({
  model,
  showViewBeacon = false,
  topSlot,
  bottomSlot,
}: Props) {
  return (
    <main className="student-result-page">
      {showViewBeacon ? <StudentResultViewBeacon submissionId={model.submissionId} /> : null}
      <h1>添削結果（確定版）</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {model.studentName} さん / taskId: {model.taskId} / 公開日時: {model.operatorApprovedAtLabel}
      </p>

      {topSlot}

      <div className="card student-result-card">
        <h2 className="student-result-section-title">得点・評価</h2>
        {model.scoreInline ? (
          <p className="student-result-score-line">{model.scoreInline}</p>
        ) : (
          <>
            <p className="student-result-score-line">合計: {model.scoreTotal}点</p>
            <pre className="student-result-pre">{model.evaluationText}</pre>
          </>
        )}
      </div>

      <div className="card student-result-card">
        <h2 className="student-result-section-title">解説</h2>
        <div
          className="student-explanation-html-wrap"
          lang="ja"
          dangerouslySetInnerHTML={{ __html: model.explanationHtml }}
        />
      </div>

      <div className="card student-result-card student-result-card--essay">
        <h2 className="student-result-section-title">完成版</h2>
        <div className="essay-final-diff" dangerouslySetInnerHTML={{ __html: model.finalEssayHtml }} />
        {model.audioSrc ? <StudentResultAudioControls src={model.audioSrc} /> : null}
      </div>

      {model.audioSrc || model.qrSrc ? (
        <div className="card student-result-card">
          <h2 className="student-result-section-title">音声（スマホ用 QR）</h2>
          <p className="muted student-result-qr-lead">
            音声には再生可能期限がありますのでダウンロードして保存してください。
          </p>
          {model.audioSrc ? (
            <StudentResultAudioQr audioHref={model.audioSrc} serverAbsolute={model.audioQrEncodeUrl} />
          ) : model.qrSrc ? (
            <div className="student-result-qr-img-wrap">
              <img
                src={model.qrSrc}
                alt="音声への QR"
                width={220}
                height={220}
                className="student-result-qr-img"
              />
            </div>
          ) : null}
          {model.audioUrl ? (
            <p className="student-result-qr-audio-link">
              同じ音声を PC のブラウザで聞く場合:{" "}
              <a href={model.audioSrc}>音声を開く</a>
            </p>
          ) : null}
          <p className="muted student-result-qr-foot">
            開いた先はページではなく <strong>mp3 ファイル</strong>です。再生ボタン（▶）を押すか、ダウンロードしてから聞いてください。
          </p>
        </div>
      ) : null}

      {bottomSlot}
    </main>
  );
}
