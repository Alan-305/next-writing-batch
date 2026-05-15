"use client";

import { useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Props = {
  /** pending がある課題ID（件数表示用） */
  pendingTaskIds: string[];
  pendingByTaskId: Record<string, number>;
  /** failed がある課題ID */
  failedTaskIds: string[];
  failedByTaskId: Record<string, number>;
};

function mergeSorted(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

export function RunProofreadPanel({
  pendingTaskIds,
  pendingByTaskId,
  failedTaskIds,
  failedByTaskId,
}: Props) {
  const { user } = useFirebaseAuthContext();
  const taskChoices = useMemo(
    () => mergeSorted(pendingTaskIds, failedTaskIds),
    [pendingTaskIds, failedTaskIds],
  );

  const [taskId, setTaskId] = useState(() => taskChoices[0] ?? "");
  const [retryFailed, setRetryFailed] = useState(false);
  const [limit, setLimit] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setLog(null);
    setError(null);
    const tid = taskId.trim();
    if (!tid) {
      setError("課題IDを選ぶか入力してください。");
      setBusy(false);
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("proofread:run-start", { detail: { taskId: tid } }));
    }
    try {
      if (!user) {
        setError("ログインしてください。");
        setBusy(false);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/run-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskId: tid,
          limit: limit === "" ? 0 : limit,
          retryFailed,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
        stdout?: string;
        stderr?: string;
      };
      if (!res.ok) {
        const hint =
          typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】` : "";
        setError((hint ? `${hint} ` : "") + (json?.message ?? "実行に失敗しました。"));
        const tail = [json.stdout, json.stderr].filter(Boolean).join("\n---\n");
        if (tail) setLog(tail);
        return;
      }
      window.location.reload();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("proofread:run-end", { detail: { taskId: tid } }));
      }
      setBusy(false);
    }
  };

  const countHint = (tid: string) => {
    const p = pendingByTaskId[tid] ?? 0;
    const f = failedByTaskId[tid] ?? 0;
    const bits: string[] = [];
    if (p) bits.push(`pending ${p}`);
    if (f) bits.push(`failed ${f}`);
    return bits.length ? `（${bits.join(" · ")}）` : "";
  };

  return (
    <form className="field" onSubmit={onSubmit} style={{ marginBottom: 0 }}>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>課題ID（taskId）</span>
        {taskChoices.length > 0 ? (
          <select
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={busy}
            style={{ maxWidth: "100%" }}
          >
            {taskChoices.map((tid) => (
              <option key={tid} value={tid}>
                {tid}
                {countHint(tid)}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="例: 2026_spring_week1"
            disabled={busy}
            autoComplete="off"
          />
        )}
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={retryFailed}
          onChange={(e) => setRetryFailed(e.target.checked)}
          disabled={busy}
        />
        <span>失敗した提出だけ再実行（<code>--retry-failed</code>）</span>
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "center" }}>
        <label>
          最大件数（空欄＝制限なし）{" "}
          <input
            type="number"
            min={0}
            max={500}
            value={limit === "" ? "" : limit}
            onChange={(e) => {
              const v = e.target.value;
              setLimit(v === "" ? "" : Math.min(500, Math.max(0, parseInt(v, 10) || 0)));
            }}
            placeholder="試しに 1"
            disabled={busy}
            style={{ width: "5.5rem", padding: 8 }}
          />
        </label>
      </div>

      <button type="submit" disabled={busy}>
        {busy ? "添削を実行中…" : "添削を実行"}
      </button>

      {error ? <p className="error" style={{ margin: "8px 0 0" }}>{error}</p> : null}
      {log && !error ? (
        <details style={{ marginTop: 8 }} className="muted">
          <summary>直近のログ（再読み込みで反映を確認）</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", marginTop: 8 }}>{log}</pre>
        </details>
      ) : log ? (
        <details style={{ marginTop: 8 }} className="muted">
          <summary>ログ</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", marginTop: 8 }}>{log}</pre>
        </details>
      ) : null}
    </form>
  );
}
