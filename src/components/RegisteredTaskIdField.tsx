"use client";

import { useEffect, useMemo, useState } from "react";

export type RegistryTaskRow = {
  taskId: string;
  displayLabel: string;
  problems: { problemId: string; title: string }[];
};

type Props = {
  value: string;
  onTaskIdChange: (taskId: string, defaultProblemId: string) => void;
  disabled?: boolean;
  errorText?: string;
  /** 複数設問の課題のみ表示 */
  problemId?: string;
  onProblemIdChange?: (problemId: string) => void;
};

/**
 * `GET /api/tasks/registry` に基づく課題プルダウン（登録のない課題は選べない）。
 */
export function RegisteredTaskIdField({
  value,
  onTaskIdChange,
  disabled,
  errorText,
  problemId,
  onProblemIdChange,
}: Props) {
  const [tasks, setTasks] = useState<RegistryTaskRow[] | null>(null);
  const [fetchErr, setFetchErr] = useState("");

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
          setFetchErr(j.message || "課題一覧を読めませんでした。");
        }
      } catch {
        if (!cancelled) setFetchErr("通信エラーで課題一覧を読めませんでした。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(() => tasks?.find((t) => t.taskId === value), [tasks, value]);

  if (tasks === null && !fetchErr) {
    return <p className="muted">課題一覧を読み込み中…</p>;
  }

  if (fetchErr) {
    return <p className="error">{fetchErr}</p>;
  }

  if (!tasks || tasks.length === 0) {
    return (
      <p className="error">
        登録済みの課題がありません。運用の「課題・添削設定」で<strong>サーバーに保存（課題ID）</strong>すると、ここに課題が表示されます。
      </p>
    );
  }

  return (
    <>
      <label className="field">
        <span>課題</span>
        <select
          value={value}
          onChange={(e) => {
            const tid = e.target.value;
            const row = tasks.find((t) => t.taskId === tid);
            const def = row?.problems[0]?.problemId ?? "";
            onTaskIdChange(tid, def);
          }}
          disabled={disabled}
        >
          <option value="">選択してください</option>
          {tasks.map((t) => (
            <option key={t.taskId} value={t.taskId}>
              {t.taskId} — {t.displayLabel}
            </option>
          ))}
        </select>
        {errorText ? <span className="error">{errorText}</span> : null}
      </label>

      {selected && selected.problems.length > 1 && onProblemIdChange ? (
        <label className="field">
          <span>設問</span>
          <select
            value={problemId ?? ""}
            onChange={(e) => onProblemIdChange(e.target.value)}
            disabled={disabled}
          >
            {selected.problems.map((p) => (
              <option key={p.problemId} value={p.problemId}>
                {p.problemId} — {p.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
