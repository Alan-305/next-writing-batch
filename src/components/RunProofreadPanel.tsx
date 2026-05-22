"use client";

import { useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Props = {
  pendingTaskIds: string[];
  pendingByTaskId: Record<string, number>;
  failedTaskIds: string[];
  failedByTaskId: Record<string, number>;
  onEnqueued?: () => void;
};

function mergeSorted(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

export function RunProofreadPanel({
  pendingTaskIds,
  pendingByTaskId,
  failedTaskIds,
  failedByTaskId,
  onEnqueued,
}: Props) {
  const { user } = useFirebaseAuthContext();
  const taskChoices = useMemo(
    () => mergeSorted(pendingTaskIds, failedTaskIds),
    [pendingTaskIds, failedTaskIds],
  );

  const [taskId, setTaskId] = useState(() => taskChoices[0] ?? "");
  const [retryFailed, setRetryFailed] = useState(false);
  const [limit, setLimit] = useState<number | "">("");
  const [busySync, setBusySync] = useState(false);
  const [busyQueue, setBusyQueue] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const runSync = async () => {
    setBusySync(true);
    setLog(null);
    setError(null);
    setMessage(null);
    const tid = taskId.trim();
    if (!tid) {
      setError("課題IDを選ぶか入力してください。");
      setBusySync(false);
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("proofread:run-start", { detail: { taskId: tid } }));
    }
    try {
      if (!user) {
        setError("ログインしてください。");
        setBusySync(false);
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/run-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskId: tid,
          workers: 1,
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
      setBusySync(false);
    }
  };

  const runQueue = async () => {
    setBusyQueue(true);
    setLog(null);
    setError(null);
    setMessage(null);
    const tid = taskId.trim();
    if (!tid) {
      setError("課題IDを選ぶか入力してください。");
      setBusyQueue(false);
      return;
    }
    try {
      if (!user) {
        setError("ログインしてください。");
        setBusyQueue(false);
        return;
      }
      const token = await user.getIdToken();

      if (retryFailed) {
        const pendingRes = await fetch("/api/ops/enqueue-proofread", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            taskId: tid,
            queuePendingForTaskId: true,
            limit: limit === "" ? 0 : limit,
          }),
        });
        const pendingJson = (await pendingRes.json()) as { ok?: boolean; message?: string; code?: string };

        const failRes = await fetch("/api/submissions", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const failListJson = (await failRes.json()) as {
          ok?: boolean;
          data?: Array<{ submissionId: string; taskId: string; status: string }>;
        };
        const failedIds =
          failListJson.ok && Array.isArray(failListJson.data)
            ? failListJson.data
                .filter((s) => s.status === "failed" && String(s.taskId ?? "").trim() === tid)
                .map((s) => s.submissionId)
            : [];
        if (failedIds.length > 0) {
          await fetch("/api/ops/enqueue-proofread", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ taskId: tid, submissionIds: failedIds }),
          });
        }
        if (!pendingJson.ok && failedIds.length === 0) {
          const hint =
            typeof pendingJson.code === "string" && pendingJson.code.trim()
              ? `【${pendingJson.code.trim()}】 `
              : "";
          setError(hint + (pendingJson.message ?? "キュー投入に失敗しました。"));
          return;
        }
        setMessage(
          pendingJson.message ??
            "キューに預けました。完了時にメールでお知らせします（約1時間ごとに途中経過も送ります）。",
        );
        onEnqueued?.();
        return;
      }

      const res = await fetch("/api/ops/enqueue-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskId: tid,
          queuePendingForTaskId: true,
          limit: limit === "" ? 0 : limit,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; code?: string; message?: string };
      if (!res.ok) {
        const hint =
          typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】` : "";
        setError((hint ? `${hint} ` : "") + (json?.message ?? "キュー投入に失敗しました。"));
        return;
      }
      setMessage(
        json.message ??
          "キューに預けました。完了時にメールでお知らせします（約1時間ごとに途中経過も送ります）。",
      );
      onEnqueued?.();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusyQueue(false);
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

  const busy = busySync || busyQueue;

  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.92rem" }}>
        <strong>今すぐ</strong> … 同期実行（完了まで待つ）。{" "}
        <strong>預ける</strong> … キューに入れて空き時間に処理（完了・途中経過をメール通知）。
      </p>

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
        <span>あわせて failed も対象にする</span>
      </label>

      <label className="field" style={{ marginBottom: 0 }}>
        <span>最大件数（0 = 制限なし）</span>
        <input
          type="number"
          min={0}
          max={500}
          value={limit}
          onChange={(e) => {
            const v = e.target.value;
            setLimit(v === "" ? "" : Math.max(0, Math.min(500, Number(v) || 0)));
          }}
          disabled={busy}
        />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        <button type="button" disabled={busy} onClick={() => void runSync()}>
          {busySync ? "processing…" : "今すぐ実行（同期）"}
        </button>
        <button type="button" disabled={busy} onClick={() => void runQueue()}>
          {busyQueue ? "預け中…" : "キューに預ける"}
        </button>
      </div>

      {error ? <p className="error" style={{ margin: "8px 0 0" }}>{error}</p> : null}
      {message ? <p className="muted" style={{ margin: "8px 0 0" }}>{message}</p> : null}
      {log ? (
        <pre className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: "0.85rem" }}>
          {log}
        </pre>
      ) : null}
    </div>
  );
}
