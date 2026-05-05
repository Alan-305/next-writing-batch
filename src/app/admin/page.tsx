import Link from "next/link";

/** 管理者（allowlist uid）専用。運用ハブ /ops とは別 URL。 */
export default function AdminHomePage() {
  return (
    <main>
      <h1>管理</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          このエリアは <code>NEXT_PUBLIC_FIREBASE_ADMIN_UIDS</code> に登録された Firebase Auth uid のみが利用できます。
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          今後、課金・権利付与などサーバー連携の UI はここに追加します。運用バッチは従来どおり{" "}
          <Link href="/ops">/ops</Link> を利用してください。ヘッダーの <strong>テナント</strong>{" "}
          プルダウンで代理テナントを選ぶと、同じブラウザでは運用 API もその{" "}
          <code>{"data/orgs/{id}/"}</code> として解決されます（空欄で Firestore の organizationId に戻ります）。その直下に、当該テナントの{" "}
          <strong>教員・生徒（想定）の名簿</strong>と人数が出ます。名前は mailto リンクで既定のメールアプリが開きます。
        </p>
      </div>
    </main>
  );
}
