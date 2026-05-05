import Link from "next/link";

import { StudentResultPublishedBody } from "@/components/StudentResultPublishedBody";
import { loadStudentResultPublishedView } from "@/lib/student-result-published-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ submissionId: string }> };

export default async function StudentResultPage({ params }: Props) {
  const { submissionId } = await params;
  const loaded = await loadStudentResultPublishedView(submissionId);

  if (loaded.kind === "missing") {
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

  if (loaded.kind === "unpublished") {
    return (
      <main>
        <h1>添削結果</h1>
        <p>
          この提出は<strong>運用からまだ公開されていません</strong>。公開後に同じ URL
          でご確認ください。
        </p>
        <p className="muted">受付番号: {loaded.submissionId}</p>
        <p>
          <Link href="/submit">提出画面へ</Link>
        </p>
      </main>
    );
  }

  const { model } = loaded;

  return (
    <StudentResultPublishedBody
      model={model}
      showViewBeacon
      topSlot={
        <div className="student-result-print-hint-block no-print">
          <p className="muted student-result-print-hint-block__text">
            印刷や PDF への保存は、ブラウザの<strong>印刷</strong>から行ってください。Mac は{" "}
            <kbd>⌘</kbd>
            <kbd>P</kbd>、Windows は <kbd>Ctrl</kbd>
            <kbd>P</kbd>、またはメニューの「印刷」を選び、保存先に「PDFに保存」などを指定できます。
          </p>
        </div>
      }
      bottomSlot={
        <p className="no-print">
          <Link href="/submit">提出画面へ戻る</Link>
          {" · "}
          <Link href="/">開発用トップ</Link>
        </p>
      }
    />
  );
}
