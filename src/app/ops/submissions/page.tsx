import Link from "next/link";

import { OpsPackageZipTaskPanel } from "@/components/OpsPackageZipTaskPanel";
import { OpsSubmissionsTable } from "@/components/OpsSubmissionsTable";
import { RunProofreadPanel } from "@/components/RunProofreadPanel";
import { getSubmissions } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OpsSubmissionsPage() {
  const submissions = await getSubmissions();

  const pendingByTaskId = new Map<string, number>();
  for (const s of submissions) {
    if (s.status !== "pending") continue;
    const t = s.taskId.trim();
    if (!t) continue;
    pendingByTaskId.set(t, (pendingByTaskId.get(t) ?? 0) + 1);
  }
  const pendingTaskIds = [...pendingByTaskId.keys()].sort();
  const totalPending = submissions.filter((s) => s.status === "pending").length;

  const failedByTaskId = new Map<string, number>();
  for (const s of submissions) {
    if (s.status !== "failed") continue;
    const t = s.taskId.trim();
    if (!t) continue;
    failedByTaskId.set(t, (failedByTaskId.get(t) ?? 0) + 1);
  }
  const failedTaskIds = [...failedByTaskId.keys()].sort();

  const tableRows = submissions
    .filter((s) => String(s.submissionId ?? "").trim().length > 0)
    .map((s) => {
      const d4 = s.day4;
      const hasDay4Assets = Boolean(
        d4 &&
          !String(d4.error ?? "").trim() &&
          (String(d4.pdf_path ?? "").trim() ||
            String(d4.audio_path ?? "").trim() ||
            String(d4.qr_path ?? "").trim()),
      );
      return {
        submissionId: s.submissionId,
        submittedAt: s.submittedAt,
        taskId: s.taskId,
        studentId: s.studentId,
        studentName: s.studentName,
        status: s.status,
        hasDay4Assets,
      };
    });

  return (
    <main>
      <h1>提出一覧</h1>
      <p>
        <Link href="/ops">運用ハブ</Link>
        {" · "}
        <Link href="/ops/deliverables">納品ZIP</Link>
        {" · "}
        <Link href="/submit">提出画面へ</Link>
      </p>

      <div className="card">
        <h2>添削を実行（Claude）</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          下のボタンから <code>batch/run_day3_proofread.py</code> を起動します（<code>data/submissions.json</code> を更新）。
          Next.js を動かしている<strong>同じ環境</strong>に <code>.venv</code> と API キーが必要です（
          <Link href="/ops/claude-key">運用でキーを保存</Link> または <code>.env.local</code> の{" "}
          <code>ANTHROPIC_API_KEY</code>
          ）。サーバに Python が無いホスティングでは使えません。
        </p>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0, lineHeight: 1.55 }}>
          <strong>添削が動かないとき</strong>は、まずターミナルでこのフォルダに移動し{" "}
          <code>npm run check:setup</code> を実行してください。[要対応] が出た行を直すと、多くの場合は解決します。ブラウザのエラーだけでは分からないときは、表示された「詳細」をそのままコピーして相談してください。
        </p>
        <p style={{ marginBottom: 8 }}>
          現在の <strong>pending</strong> 件数: {totalPending}
          {pendingTaskIds.length > 0 ? (
            <>
              {" "}
              （taskId 別:{" "}
              {pendingTaskIds.map((tid, i) => (
                <span key={tid}>
                  {i > 0 ? " · " : null}
                  <code>{tid}</code> {pendingByTaskId.get(tid) ?? 0} 件
                </span>
              ))}
              ）
            </>
          ) : null}
        </p>
        <RunProofreadPanel
          pendingTaskIds={pendingTaskIds}
          pendingByTaskId={Object.fromEntries(pendingByTaskId)}
          failedTaskIds={failedTaskIds}
          failedByTaskId={Object.fromEntries(failedByTaskId)}
        />
        <details className="muted" style={{ marginTop: 16 }}>
          <summary>ターミナルから同じことをする場合</summary>
          <p style={{ marginTop: 8, marginBottom: 6 }}>
            <code>next-writing-batch</code> をカレントにし、仮想環境の Python で実行します。
          </p>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {`export ANTHROPIC_API_KEY='…'

./.venv/bin/python3 batch/run_day3_proofread.py --task-id 課題ID --workers 2 --limit 1

# 全件: --limit を外す。失敗分のみ: --retry-failed`}
          </pre>
        </details>
      </div>

      <OpsPackageZipTaskPanel />

      <div className="card">
        <OpsSubmissionsTable rows={tableRows} enableZipSelection />
      </div>
    </main>
  );
}
