"use client";

import Link from "next/link";
import { useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";

type DeleteAccountApiJson = {
  ok?: boolean;
  targetUid?: string;
  deletedSubmissionDocs?: number;
  subcollectionsDeleted?: Record<string, number>;
  userDocumentExisted?: boolean;
  authUserExisted?: boolean;
  authUserDeleted?: boolean;
  message?: string;
  code?: string;
  detail?: string;
};

export default function AdminAccountDeletePage() {
  const { user } = useFirebaseAuthContext();
  const [targetUid, setTargetUid] = useState("");
  const [confirmUid, setConfirmUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    const u = getFirebaseAuth()?.currentUser;
    if (!u) {
      setError("ログイン情報を取得できませんでした。");
      return;
    }
    setBusy(true);
    try {
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/user-account-delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetUid: targetUid.trim(),
          confirmTargetUid: confirmUid.trim(),
        }),
      });
      const j = (await res.json()) as DeleteAccountApiJson;
      if (!res.ok || j.ok !== true) {
        const msg = j.message ?? "実行に失敗しました。";
        const detail = j.detail ? ` (${j.detail})` : "";
        setError(`${msg}${detail}`);
        return;
      }
      const sub = Object.entries(j.subcollectionsDeleted ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      setResult(
        `完了しました。対象 UID: ${j.targetUid ?? "—"} / 削除した提出ドキュメント: ${j.deletedSubmissionDocs ?? 0} / ` +
          `ユーザードキュメント: ${j.userDocumentExisted ? "削除" : "なし"} / ` +
          `サブコレクション: ${sub || "—"} / ` +
          `Auth: ${j.authUserExisted ? (j.authUserDeleted ? "削除済み" : "削除できず") : "もともとなし"}`,
      );
      setTargetUid("");
      setConfirmUid("");
    } catch {
      setError("通信エラーで実行できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>退会・ユーザー削除（管理者）</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        対象の <strong>Firebase Auth ユーザー</strong>と <code>users/{"{uid}"}</code> 配下を削除し、
        <code>organizations</code> に登録があるテナントおよび対象ユーザーの <code>organizationId</code>・既定テナントについて{" "}
        <code>submittedByUid</code> が一致する提出を削除します。
        同じ Google アカウントで再登録すると<strong>新しい uid</strong>として扱われます。
      </p>
      <p className="muted">
        <strong>削除しないもの:</strong> Cloud Storage 上の Day4 音声・PDF、Stripe の顧客・決済履歴、
        <code>submittedByUid</code> の無い提出。必要に応じて別途運用してください。
      </p>
      {user ? (
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          いまの管理者 UID: <code style={{ wordBreak: "break-all" }}>{user.uid}</code>
        </p>
      ) : null}

      <div className="card">
        <form onSubmit={(ev) => void onSubmit(ev)}>
          <div className="field">
            <span>削除するユーザーの UID（Firebase Auth）</span>
            <input
              type="text"
              value={targetUid}
              onChange={(ev) => setTargetUid(ev.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder="例: abc123..."
            />
          </div>
          <div className="field">
            <span>確認のため同じ UID を再入力</span>
            <input
              type="text"
              value={confirmUid}
              onChange={(ev) => setConfirmUid(ev.target.value)}
              autoComplete="off"
              disabled={busy}
              placeholder="上と同じ UID"
            />
          </div>
          {error ? <p className="error">{error}</p> : null}
          {result ? <p className="success">{result}</p> : null}
          <p style={{ marginBottom: 0 }}>
            <button type="submit" disabled={busy}>
              {busy ? "削除中…" : "退会処理を実行（取り消し不可）"}
            </button>
          </p>
        </form>
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        <Link href="/admin">管理トップへ</Link>
        {" · "}
        <Link href="/admin/billing">チケット調整</Link>
      </p>
    </main>
  );
}
