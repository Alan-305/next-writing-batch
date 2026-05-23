"use client";

import { useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { OPS_COPY } from "@/lib/ops/submission-status-labels";
import { PROOFREAD_MAX_ENQUEUE_BATCH } from "@/lib/proofread/proofread-job-types";

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

  const resolvedLimit =
    limit === "" ? PROOFREAD_MAX_ENQUEUE_BATCH : Math.min(PROOFREAD_MAX_ENQUEUE_BATCH, limit);

  const runSync = async () => {
    setBusySync(true);
    setLog(null);
    setError(null);
    setMessage(null);
    const tid = taskId.trim();
    if (!tid) {
      setError("課題IDを選んでください。");
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
          limit: resolvedLimit,
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
      setError("課題IDを選んでください。");
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
        const failRes = await fetch("/api/submissions", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const failListJson = (await failRes.json()) as {
          ok?: boolean;
          data?: Array<{ submissionId: string; taskId: string; status: string }>;
        };
        const rows =
          failListJson.ok && Array.isArray(failListJson.data) ? failListJson.data : [];
        const pendingRows = rows.filter(
          (s) => s.status === "pending" && String(s.taskId ?? "").trim() === tid,
        );
        const failedRows = rows.filter(
          (s) => s.status === "failed" && String(s.taskId ?? "").trim() === tid,
        );
        const batchIds = [...pendingRows, ...failedRows]
          .slice(0, resolvedLimit)
          .map((s) => s.submissionId);
        if (batchIds.length === 0) {
          setError("未添削・要再実行の提出がありません。");
          return;
        }
        const res = await fetch("/api/ops/enqueue-proofread", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ taskId: tid, submissionIds: batchIds }),
        });
        const json = (await res.json()) as { ok?: boolean; code?: string; message?: string };
        if (!res.ok) {
          const hint =
            typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】 ` : "";
          setError(hint + (json.message ?? "キュー投入に失敗しました。"));
          return;
        }
        setMessage(json.message ?? "キューに預けました。完了時にメールでお知らせします。");
        onEnqueued?.();
        return;
      }

      const res = await fetch("/api/ops/enqueue-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          taskId: tid,
          queuePendingForTaskId: true,
          limit: resolvedLimit,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; code?: string; message?: string };
      if (!res.ok) {
        const hint =
          typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】` : "";
        setError((hint ? `${hint} ` : "") + (json?.message ?? "キュー投入に失敗しました。"));
        return;
      }
      setMessage(json.message ?? "キューに預けました。完了時にメールでお知らせします。");
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
    if (p) bits.push(`未添削 ${p}`);
    if (f) bits.push(`要再実行 ${f}`);
    return bits.length ? `（${bits.join(" · ")}）` : "";
  };

  const busy = busySync || busyQueue;

  return (
    <div>
      <div className="ops-panel-grid">
        <label className="field">
          <span>課題ID</span>
          {taskChoices.length > 0 ? (
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              disabled={busy}
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

        <label className="field">
          <span>最大件数</span>
          <input
            type="number"
            min={1}
            max={PROOFREAD_MAX_ENQUEUE_BATCH}
            value={limit}
            onChange={(e) => {
              const v = e.target.value;
              setLimit(
                v === ""
                  ? ""
                  : Math.max(1, Math.min(PROOFREAD_MAX_ENQUEUE_BATCH, Number(v) || 1)),
              );
            }}
            disabled={busy}
            placeholder={`1〜${PROOFREAD_MAX_ENQUEUE_BATCH}（空欄=${PROOFREAD_MAX_ENQUEUE_BATCH}件）`}
          />
        </label>

        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 8 }}>
          <input
            type="checkbox"
            checked={retryFailed}
            onChange={(e) => setRetryFailed(e.target.checked)}
            disabled={busy}
          />
          <span>要再実行も含める</span>
        </label>
      </div>

      <div className="ops-panel-actions">
        <button type="button" className="ops-btn ops-btn--ghost" disabled={busy} onClick={() => void runSync()}>
          {busySync ? OPS_COPY.bulkNowBusy : OPS_COPY.bulkNow}
        </button>
        <button type="button" className="ops-btn ops-btn--queue" disabled={busy} onClick={() => void runQueue()}>
          {busyQueue ? OPS_COPY.bulkQueueBusy : OPS_COPY.bulkQueue}
        </button>
      </div>

      {error ? <p className="error" style={{ margin: "12px 0 0" }}>{error}</p> : null}
      {message ? <p className="muted" style={{ margin: "12px 0 0" }}>{message}</p> : null}
      {log ? (
        <pre className="muted ops-details" style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
          {log}
        </pre>
      ) : null}

      <details className="ops-details">
        <summary>ターミナルから実行する場合</summary>
        <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: "0.85rem" }}>
          {`export NEXT_WRITING_BATCH_KEY='…'
export NWB_ORGANIZATION_ID=your_tenant_id

./.venv/bin/python3 batch/run_day3_proofread.py --task-id 課題ID --submission-ids 受付UUID`}
        </pre>
      </details>
    </div>
  );
}
