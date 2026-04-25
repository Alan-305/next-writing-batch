"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { RegistryTaskRow } from "@/components/RegisteredTaskIdField";

type Props = {
  submissionId: string;
  initialTaskId: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function OpsSubmissionTaskIdEditor({
  submissionId,
  initialTaskId,
  disabled = false,
  disabledReason,
}: Props) {
  const router = useRouter();
  const [taskId, setTaskId] = useState(initialTaskId);
  const [tasks, setTasks] = useState<RegistryTaskRow[] | null>(null);
  const [registryErr, setRegistryErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setTaskId(initialTaskId);
  }, [initialTaskId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/tasks/registry");
        const j = (await r.json()) as { ok?: boolean; tasks?: RegistryTaskRow[]; message?: string };
        if (cancelled) return;
        if (j.ok && Array.isArray(j.tasks)) {
          setTasks(j.tasks);
        } else {
          setRegistryErr(j.message || "課題一覧を読めませんでした。");
        }
      } catch {
        if (!cancelled) setRegistryErr("通信エラーで課題一覧を読めませんでした。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const taskIdSet = useMemo(() => new Set((tasks ?? []).map((t) => t.taskId)), [tasks]);
  const currentNotInRegistry =
    Boolean(initialTaskId.trim()) && !taskIdSet.has(initialTaskId.trim());

  const onSave = async () => {
    if (disabled || busy) return;
    setMessage("");
    setError("");
    const tid = taskId.trim();
    if (tid === initialTaskId.trim()) {
      setMessage("課題IDに変更はありません。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/task-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: tid }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        fields?: { taskId?: string };
      };
      if (!res.ok) {
        setError(json?.fields?.taskId ?? json?.message ?? "更新に失敗しました。");
        return;
      }
      setMessage(json?.message ?? "保存しました。");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
      <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>課題IDの修正</h3>
      <p className="muted" style={{ marginTop: 0, marginBottom: 10, fontSize: "0.9rem" }}>
        間違った課題のまま添削したあとに正しい課題で出し直す場合は、
        <strong>先にここで課題IDを保存</strong>してから、提出一覧の<strong>「添削やり直し」</strong>を実行してください。
        再添削が完了すると、以前の AI 添削結果は新しい結果で上書きされます。
      </p>
      {disabled && disabledReason ? <p className="error">{disabledReason}</p> : null}
      {tasks === null && !registryErr ? (
        <p className="muted" style={{ marginBottom: 10 }}>
          課題一覧を読み込み中…
        </p>
      ) : null}
      {registryErr ? <p className="error">{registryErr}</p> : null}
      {!registryErr && tasks && tasks.length === 0 ? (
        <div style={{ marginBottom: 10 }}>
          <p className="error" style={{ marginBottom: 6 }}>
            登録済みの課題がありません。「課題・添削設定」でサーバーに保存すると、ここにプルダウンが表示されます。
          </p>
          {initialTaskId.trim() ? (
            <p className="muted" style={{ marginBottom: 0 }}>
              現在の taskId: <code>{initialTaskId.trim()}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {!registryErr && tasks && tasks.length > 0 ? (
        <label className="field" style={{ display: "block", marginBottom: 10 }}>
          <span>課題（taskId）</span>
          <select
            value={taskId.trim()}
            onChange={(e) => setTaskId(e.target.value)}
            disabled={disabled || busy}
            style={{ width: "100%", maxWidth: 560 }}
          >
            {currentNotInRegistry ? (
              <option value={initialTaskId.trim()}>
                {initialTaskId.trim()} — （現在の値・登録リストにありません）
              </option>
            ) : null}
            {tasks.map((t) => (
              <option key={t.taskId} value={t.taskId}>
                {t.taskId} — {t.displayLabel}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        disabled={disabled || busy || registryErr !== "" || !tasks?.length}
        onClick={() => void onSave()}
      >
        {busy ? "保存中…" : "課題IDを保存（マスタと同期）"}
      </button>
      {message ? (
        <p className="success" style={{ marginTop: 10, marginBottom: 0 }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error" style={{ marginTop: 10, marginBottom: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
