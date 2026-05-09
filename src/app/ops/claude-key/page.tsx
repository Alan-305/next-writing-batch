"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Status = {
  configured: boolean;
  source: "env" | "file" | "none";
  filePath: string;
};

export default function OpsClaudeKeyPage() {
  const { user, authLoading } = useFirebaseAuthContext();
  const [status, setStatus] = useState<Status | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setStatus(null);
      return;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/claude-key", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json()) as Status & { ok?: boolean };
      if (res.ok && j.source) {
        setStatus({ configured: j.configured, source: j.source, filePath: j.filePath });
      }
    } catch {
      setStatus(null);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [load, authLoading]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!user) {
        setError("ログインが必要です。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/claude-key", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ apiKey }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setError(j?.message ?? "保存に失敗しました。");
        return;
      }
      setApiKey("");
      setMessage(j?.message ?? "保存しました。");
      await load();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    if (!window.confirm("保存したキー（ファイル）を削除します。よろしいですか？")) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!user) {
        setError("ログインが必要です。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/claude-key", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) {
        setError(j?.message ?? "削除に失敗しました。");
        return;
      }
      setMessage(j?.message ?? "削除しました。");
      await load();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel =
    status?.source === "env"
      ? "環境変数（.env.local など）"
      : status?.source === "file"
        ? "保存ファイル（data/anthropic_api_key.txt）"
        : "未設定";

  return (
    <main>
      <h1>Claude API キー</h1>
      <p>
        <Link href="/ops">運用ハブ</Link> · <Link href="/ops/submissions">提出一覧</Link>
      </p>

      {!authLoading && !user ? (
        <p className="error">教員または管理者としてログインしてください。</p>
      ) : null}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          添削バッチで使います。<strong>環境変数</strong> <code>ANTHROPIC_API_KEY</code> が
          <strong>優先</strong>され、無いときだけ <code>data/anthropic_api_key.txt</code> の
          1行目を読みます。キーは<strong>平文</strong>なので Git にコミットしないでください（
          <code>.gitignore</code> に含めています）。
        </p>
        {status ? (
          <p style={{ marginBottom: 12 }}>
            現在: <strong>{status.configured ? "利用可能" : "未設定"}</strong>（取得元: {sourceLabel}）
          </p>
        ) : (
          <p className="muted">状態を読み込み中…</p>
        )}

        <form style={{ padding: 14, marginBottom: 12, border: "1px solid #e2e8f0", borderRadius: 8 }} onSubmit={onSave}>
          <label className="field">
            <span>API キーを保存（1回入力すればよい）</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "保存中…" : "ファイルに保存"}
          </button>
        </form>

        <button type="button" disabled={busy} onClick={() => void onClear()}>
          保存ファイルだけ削除（環境変数は消せません）
        </button>

        {message ? <p className="success" style={{ marginTop: 12 }}>{message}</p> : null}
        {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}
      </div>
    </main>
  );
}
