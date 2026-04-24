import Link from "next/link";

import { DeliverablesZipRowActions } from "@/components/DeliverablesZipRowActions";
import { formatDateTimeMs } from "@/lib/format-date";
import { listDeliverableZips } from "@/lib/deliverables-store";

/** output/zips を実行時に読むため SSG にしない（ビルド後に ZIP が増える） */
export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DeliverablesPage() {
  const zips = await listDeliverableZips();

  return (
    <main>
      <h1>納品ZIP（ダウンロード）</h1>
      <p className="muted">
        課題単位・個別選択で作成した ZIP がここに並びます。フォルダ実体は <code>output/zips/</code> です。
        <strong>課題ID</strong>列はファイル名からの推定です（<code>selection_*.zip</code> は複数提出のため「個別選択」）。
      </p>
      <p>
        <Link href="/ops">運用ハブへ</Link>
        {" · "}
        <Link href="/ops/submissions">提出一覧</Link>
      </p>

      <div className="card">
        {zips.length === 0 ? (
          <p>まだ ZIP がありません。ターミナルで次を実行してください。</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>課題ID（推定）</th>
                <th>ファイル</th>
                <th>サイズ</th>
                <th>更新</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {zips.map((z) => (
                <tr key={z.name}>
                  <td>
                    {z.taskIdFromName ? (
                      <code>{z.taskIdFromName}</code>
                    ) : (
                      <span className="muted">個別選択</span>
                    )}
                  </td>
                  <td>
                    <code>{z.name}</code>
                  </td>
                  <td>{formatBytes(z.size)}</td>
                  <td>{formatDateTimeMs(z.mtimeMs)}</td>
                  <td>
                    <DeliverablesZipRowActions fileName={z.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <pre style={{ whiteSpace: "pre-wrap", marginTop: 16, marginBottom: 0 }}>
{`./.venv/bin/python3 batch/package_task_outputs.py --task-id 課題ID`}
        </pre>
      </div>
    </main>
  );
}
