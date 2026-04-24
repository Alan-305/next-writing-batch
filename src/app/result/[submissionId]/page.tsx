import Link from "next/link";

import { finalEssayHtmlWithRevisionHighlights } from "@/lib/final-essay-diff-html";
import { formatDateTimeIso } from "@/lib/format-date";
import { formatExplanationForPublicView } from "@/lib/student-release";
import { getSubmissionById } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ submissionId: string }> };

function outputPublicHref(relativePath: string): string {
  const p = relativePath.replace(/^\/+/, "");
  return p.startsWith("output/") ? `/${p}` : `/${p}`;
}

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

  const pdfPath = submission.day4?.pdf_path?.trim();
  const pdfHref = pdfPath ? outputPublicHref(pdfPath) : "";

  const qrPath = submission.day4?.qr_path?.trim() ?? "";
  const qrSrc = qrPath ? (qrPath.startsWith("/") ? qrPath : `/${qrPath}`) : "";
  const audioUrl = String(submission.day4?.audio_url ?? "").trim();

  const finalEssayHtml = finalEssayHtmlWithRevisionHighlights(submission.essayText ?? "", sr.finalText ?? "");

  return (
    <main>
      <h1>添削結果（確定版）</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {submission.studentName} さん / taskId: {submission.taskId} / 公開日時:{" "}
        {formatDateTimeIso(sr.operatorApprovedAt)}
      </p>

      <div className="card">
        <h2>得点・評価</h2>
        <p style={{ margin: "0 0 10px", fontWeight: 600 }}>
          合計: {sr.scoreTotal}点
        </p>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sr.evaluation}</pre>
      </div>

      <div className="card">
        <h2>全体コメント</h2>
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sr.generalComment}</pre>
      </div>

      <div className="card">
        <h2>解説</h2>
        <pre
          lang="ja"
          style={{ whiteSpace: "pre-wrap", margin: 0, lineBreak: "strict" }}
        >
          {formatExplanationForPublicView(sr.explanation)}
        </pre>
      </div>

      <div className="card">
        <h2>完成版（英文）</h2>
        <p className="muted" style={{ marginTop: 0, marginBottom: 10 }}>
          提出した原文と比べて<strong>変わった部分</strong>を赤く表示しています（語・空白の単位の目安です）。
        </p>
        <div className="essay-final-diff" dangerouslySetInnerHTML={{ __html: finalEssayHtml }} />
      </div>

      {qrSrc ? (
        <div className="card">
          <h2>音声（スマホ用 QR）</h2>
          <p className="muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
            音声には再生可能期限がありますのでダウンロードして保存してください。
          </p>
          <div style={{ marginBottom: 12 }}>
            <img
              src={qrSrc}
              alt="音声への QR"
              width={220}
              height={220}
              style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}
            />
          </div>
          {audioUrl ? (
            <p style={{ wordBreak: "break-all", marginBottom: 0 }}>
              同じ音声を PC のブラウザで聞く場合:{" "}
              <a href={hrefForAudioUrl(audioUrl)}>音声を開く</a>
            </p>
          ) : null}
          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            開いた先はページではなく <strong>mp3 ファイル</strong>です。再生ボタン（▶）を押すか、ダウンロードしてから聞いてください。
          </p>
        </div>
      ) : null}

      {pdfHref ? (
        <div className="card">
          <h2>PDF</h2>
          <p>
            <a href={pdfHref} download className="student-download-btn">
              PDFでダウンロード
            </a>
          </p>
        </div>
      ) : null}

      <p>
        <Link href="/submit">提出画面へ戻る</Link>
        {" · "}
        <Link href="/">開発用トップ</Link>
      </p>
    </main>
  );
}
