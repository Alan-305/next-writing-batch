"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type RegistryRow = { taskId: string; displayLabel: string };

type Props = {
  /** 親 card 内に埋め込む（外側 card は付けない） */
  embedded?: boolean;
};

export function OpsPackageZipTaskPanel({ embedded = false }: Props) {
  const { user } = useFirebaseAuthContext();
  const [tasks, setTasks] = useState<RegistryRow[] | null>(null);
  const [taskId, setTaskId] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers: Record<string, string> = {};
        if (user) {
          const token = await user.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        }
        const r = await fetch("/api/tasks/registry", { headers });
        const j = (await r.json()) as { ok?: boolean; tasks?: RegistryRow[]; message?: string };
        if (cancelled) return;
        if (j.ok && Array.isArray(j.tasks)) {
          setTasks(j.tasks);
        } else {
          setLoadErr(j.message || "課題一覧を読めませんでした。");
        }
      } catch {
        if (!cancelled) setLoadErr("通信エラーで課題一覧を読めませんでした。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const onZipByTask = async () => {
    const tid = taskId.trim();
    if (!tid) {
      setMsg("課題を選んでください。");
      return;
    }
    if (!window.confirm(`課題「${tid}」の Day4 成果物を ZIP にまとめます。よろしいですか？`)) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      if (!user) {
        setMsg("ログインしてください。");
        setBusy(false);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/package-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "task", taskId: tid }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; stdout?: string; stderr?: string };
      if (!res.ok || !j.ok) {
        const tail = [j.stdout, j.stderr].filter(Boolean).join("\n---\n");
        setMsg(`${j.message ?? "失敗しました。"}${tail ? `\n${tail}` : ""}`);
        return;
      }
      setMsg(j.message ?? "完了しました。");
      window.location.href = "/ops/deliverables";
    } catch {
      setMsg("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  const inner = (
    <>
      <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
        <Link href="/ops/deliverables">納品ZIPのダウンロード一覧</Link>
      </p>

      {loadErr ? <p className="error">{loadErr}</p> : null}
      {tasks === null && !loadErr ? <p className="muted">課題一覧を読み込み中…</p> : null}
      {tasks && tasks.length === 0 ? (
        <p className="muted">登録課題がありません。課題・添削設定から保存してください。</p>
      ) : null}

      {tasks && tasks.length > 0 ? (
        <div className="ops-panel-grid">
          <label className="field">
            <span>課題</span>
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={busy}>
              <option value="">選択してください</option>
              {tasks.map((t) => (
                <option key={t.taskId} value={t.taskId}>
                  {t.taskId} — {t.displayLabel}
                </option>
              ))}
            </select>
          </label>
          <div className="ops-panel-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="ops-btn ops-btn--primary"
              disabled={busy || !taskId.trim()}
              onClick={() => void onZipByTask()}
            >
              {busy ? "ZIP 作成中…" : "ZIP を作成"}
            </button>
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className={msg.includes("失敗") || msg.includes("エラー") ? "error" : "muted"} style={{ marginTop: 12 }}>
          {msg}
        </p>
      ) : null}
    </>
  );

  if (embedded) return inner;

  return (
    <div className="card">
      <h2>納品ZIP（課題単位）</h2>
      {inner}
    </div>
  );
}
