import Link from "next/link";
import { headers } from "next/headers";

import { StudentResultPublishedBody } from "@/components/StudentResultPublishedBody";
import { loadStudentResultPublishedView } from "@/lib/student-result-published-view";
import { studentSubmitPagePath } from "@/lib/student-submit-page-path";

function requestOriginFromHeaders(h: Headers): string {
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]?.trim() ?? "";
  if (!host) return "";
  const proto = (h.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() ?? "https";
  return `${proto}://${host}`;
}

function BackToSubmitLink({ organizationId }: { organizationId: string }) {
  const href = studentSubmitPagePath(organizationId);
  if (!href) {
    return (
      <p className="muted no-print" style={{ marginBottom: 0 }}>
        提出・受け取り画面へは、先生から共有された招待リンクから開いてください。
      </p>
    );
  }
  return (
    <p className="no-print" style={{ marginBottom: 0 }}>
      <Link href={href}>提出・受け取りへ戻る</Link>
    </p>
  );
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ submissionId: string }> };

export default async function StudentResultPage({ params }: Props) {
  const { submissionId } = await params;
  const h = await headers();
  const loaded = await loadStudentResultPublishedView(submissionId, {
    requestOrigin: requestOriginFromHeaders(h),
  });

  if (loaded.kind === "missing") {
    return (
      <main>
        <h1>添削結果</h1>
        <p>該当する提出が見つかりませんでした。</p>
        <p className="muted" style={{ marginBottom: 0 }}>
          提出・受け取り画面へは、先生から共有された招待リンクから開いてください。
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
        <BackToSubmitLink organizationId={loaded.organizationId} />
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
            印刷や PDF への保存は、ブラウザの<strong>印刷</strong>から行ってください。解説・完成版の長さに合わせ、
            <strong>A4 用紙 2 枚</strong>に収まるよう文字サイズと行間を自動調整します。Mac は <kbd>⌘</kbd>
            <kbd>P</kbd>、Windows は <kbd>Ctrl</kbd>
            <kbd>P</kbd>、またはメニューの「印刷」を選び、保存先に「PDFに保存」などを指定できます。
          </p>
        </div>
      }
      bottomSlot={<BackToSubmitLink organizationId={loaded.organizationId} />}
    />
  );
}
