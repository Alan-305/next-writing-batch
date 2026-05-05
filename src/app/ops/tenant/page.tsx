"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type TenantPayload = {
  ok?: boolean;
  resolvedOrganizationId?: string;
  firestoreRaw?: string | null;
  usedFallback?: boolean;
  fallbackOrganizationId?: string;
  orgsOnDisk?: string[];
  tenantDevSelfAssignAllowed?: boolean;
  message?: string;
};

export default function OpsTenantPage() {
  const { user } = useFirebaseAuthContext();
  const [data, setData] = useState<TenantPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftOrg, setDraftOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState("");

  const authHeader = useCallback(async (): Promise<Record<string, string> | null> => {
    if (!user) return null;
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ah = await authHeader();
      const res = await fetch("/api/ops/tenant", { headers: ah ? { ...ah } : {} });
      const j = (await res.json()) as TenantPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "取得に失敗しました。");
        setData(null);
        return;
      }
      setData(j);
      setDraftOrg(j.resolvedOrganizationId ?? "");
    } catch {
      setError("通信エラーで取得できませんでした。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySelfAssign = async (body: Record<string, unknown>) => {
    setBusy(true);
    setActionMsg("");
    setError("");
    try {
      const ah = await authHeader();
      const res = await fetch("/api/ops/tenant-dev-self-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(ah ?? {}) },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "更新に失敗しました。");
        return;
      }
      setActionMsg("Firestore の organizationId を更新しました。反映を確認するにはページを再読み込みしてください。");
      await load();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 運用ホーム</Link>
      </p>
      <h1>テナント（検証）</h1>
      <p className="muted">
        API とディスクは <code>{"users/{uid}.organizationId"}</code> を正規化した値で{" "}
        <code>{"data/orgs/{id}/"}</code> に分離されます。色・文言の変更は「生徒画面の見た目」でテナントごとに別ファイルになります。
      </p>

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : error && !data ? (
        <p className="muted" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      ) : data ? (
        <>
          <div className="card" style={{ maxWidth: 640, padding: "18px 20px" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>現在の解決結果</h2>
            <dl style={{ margin: 0, display: "grid", gap: "10px 16px", gridTemplateColumns: "auto 1fr" }}>
              <dt className="muted">実際に使うテナント ID</dt>
              <dd style={{ margin: 0, fontWeight: 700 }}>{data.resolvedOrganizationId}</dd>
              <dt className="muted">Firestore の値（生）</dt>
              <dd style={{ margin: 0 }}>{data.firestoreRaw === null ? "（未設定）" : String(data.firestoreRaw)}</dd>
              <dt className="muted">フォールバックを使っているか</dt>
              <dd style={{ margin: 0 }}>{data.usedFallback ? "はい（既定テナント）" : "いいえ"}</dd>
              <dt className="muted">環境の既定（DEFAULT_ORGANIZATION_ID）</dt>
              <dd style={{ margin: 0 }}>
                <code>{data.fallbackOrganizationId}</code>
              </dd>
            </dl>
          </div>

          <div className="card" style={{ maxWidth: 640, padding: "18px 20px", marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>ディスク上の組織フォルダ</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              リポジトリ内の <code>data/orgs/*/ </code> です。サンプルとして{" "}
              <code>tenant-demo-east</code> を用意しています（紫系のブランディング）。
            </p>
            {data.orgsOnDisk?.length ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: "1.2rem" }}>
                {data.orgsOnDisk.map((id) => (
                  <li key={id}>
                    <code>{id}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ marginBottom: 0 }}>
                まだありません。
              </p>
            )}
          </div>

          <div className="card" style={{ maxWidth: 640, padding: "18px 20px", marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>自分のテナントを切り替える（開発のみ）</h2>
            {!data.tenantDevSelfAssignAllowed ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                無効です。ローカル検証するときだけ <code>.env.local</code> に{" "}
                <code>TENANT_DEV_SELF_ASSIGN=true</code> を書き、Next の開発サーバーを再起動してください。本番では付けないでください。
              </p>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>
                  次のボタンは <strong>ログイン中のあなた</strong>の Firestore プロフィールだけを更新します。別アカウントは別テナントにできます。
                </p>
                <div className="field">
                  <span>organizationId（英数字・-_ のみ。正規化されます）</span>
                  <input
                    type="text"
                    value={draftOrg}
                    onChange={(e) => setDraftOrg(e.target.value)}
                    autoComplete="off"
                    placeholder="tenant-demo-east"
                  />
                </div>
                <p style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, marginBottom: 0 }}>
                  <button type="button" disabled={busy} onClick={() => void applySelfAssign({ organizationId: draftOrg })}>
                    この値に設定
                  </button>
                  <button type="button" disabled={busy} onClick={() => void applySelfAssign({ useDefault: true })}>
                    未設定に戻す（既定テナントへ）
                  </button>
                </p>
                {error ? (
                  <p className="muted" style={{ color: "#b91c1c", marginTop: 12, marginBottom: 0 }}>
                    {error}
                  </p>
                ) : null}
                {actionMsg ? (
                  <p className="muted" style={{ color: "#15803d", marginTop: 12, marginBottom: 0 }}>
                    {actionMsg}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
