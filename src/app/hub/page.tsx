import Link from "next/link";

/** 開発・運用向けの導線集（トップは /tensaku-kakumei へリダイレクト） */
export default function HubPage() {
  return (
    <main>
      <h1>Next Writing Batch</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0 }}>
          <Link href="/tensaku-kakumei">
            <strong>添削革命</strong>（教員向け特別サイト・試作）
          </Link>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          開発の想い・試験運用の案内・サポートフォーム（Resend）への導線です。
        </p>
      </div>
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          終了するとき: <code>npm run dev</code> は <b>Ctrl+C</b>。止まらなければ運用画面の手順の{" "}
          <code>npm run dev:stop</code> を参照。
        </p>
        <p>提出・運用の導線です。</p>
        <ul>
          <li>
            <Link href="/register/teacher">初めての教員：テナント作成（ログイン後）</Link>
          </li>
          <li>
            <Link href="/submit">生徒提出画面</Link>
          </li>
          <li>
            <Link href="/ops">運用ハブ（バッチ手順・一覧）</Link>
          </li>
          <li>
            <Link href="/ops/submissions">提出一覧</Link>
          </li>
          <li>
            <Link href="/ops/deliverables">納品ZIPダウンロード</Link>
          </li>
          <li>
            添削の<strong>確定結果</strong>（運用が公開後）: URL <code>/result/受付番号</code>
          </li>
        </ul>
      </div>
    </main>
  );
}
