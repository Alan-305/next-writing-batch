"use client";

import { useState, type CSSProperties } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isStaleQueuedRow } from "@/lib/proofread/proofread-job-types";

type CommonProps = {
  submissionId: string;
  taskId: string;
  studentLabel: string;
  proofreadQueuedAt?: string;
  onEnqueued?: () => void;
  onCancelled?: () => void;
};

type Props = CommonProps & {
  status: string;
};

async function postRunProofreadSync(
  idToken: string,
  body: {
    taskId: string;
    submissionIds: string[];
    retryFailed: boolean;
  },
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/ops/run-proofread", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      taskId: body.taskId.trim(),
      submissionIds: body.submissionIds,
      workers: 1,
      retryFailed: body.retryFailed,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    message?: string;
    stderr?: string;
    stdout?: string;
  };
  if (!res.ok) {
    const hint =
      typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】` : "";
    let msg = (hint ? `${hint} ` : "") + (json?.message ?? "添削の実行に失敗しました。");
    const errTail = (json.stderr ?? "").trim();
    if (errTail) {
      const short = errTail.length > 1500 ? `${errTail.slice(0, 1500)}…` : errTail;
      msg += `\n\n──── サーバーからの詳細 ────\n${short}`;
    }
    return { ok: false, message: msg };
  }
  return { ok: true, message: json.message };
}

async function postEnqueueProofread(
  idToken: string,
  body: {
    taskId: string;
    submissionIds: string[];
    forceRedo?: boolean;
  },
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/ops/enqueue-proofread", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    code?: string;
    message?: string;
  };
  if (!res.ok) {
    const hint =
      typeof json.code === "string" && json.code.trim() ? `【${json.code.trim()}】` : "";
    return { ok: false, message: (hint ? `${hint} ` : "") + (json?.message ?? "キュー投入に失敗しました。") };
  }
  return {
    ok: true,
    message:
      json.message ??
      "添削をキューに預けました。空き時間に処理され、完了時にメールでお知らせします（約1時間ごとに途中経過も送ります）。",
  };
}

const btnBase: CSSProperties = {
  padding: "8px 12px",
  fontSize: "0.9rem",
  color: "#fff",
};

/** 即時型 + 預け型の添削ボタン */
export function ProofreadSubmissionButton({
  submissionId,
  taskId,
  studentLabel,
  status,
  proofreadQueuedAt,
  onEnqueued,
}: Props) {
  const { user } = useFirebaseAuthContext();
  const [busySync, setBusySync] = useState(false);
  const [busyQueue, setBusyQueue] = useState(false);

  const staleQueued = status === "queued" && isStaleQueuedRow({ status, proofreadQueuedAt });
  const activeQueued = status === "queued" && !staleQueued;

  const canAct =
    status === "pending" ||
    status === "failed" ||
    staleQueued ||
    status === "processing";

  const retryFailed = status === "failed" || status === "processing" || staleQueued;

  const onSync = async () => {
    if (!canAct || busySync || busyQueue || activeQueued) return;
    const stuck =
      status === "processing" || staleQueued
        ? "\n\n※ 前回の処理が途中で止まった可能性があります。このまま再実行してよろしいですか？"
        : "";
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【今すぐ添削】完了までこの画面でお待ちください。${stuck}`,
    );
    if (!ok) return;

    setBusySync(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postRunProofreadSync(token, {
        taskId,
        submissionIds: [submissionId],
        retryFailed,
      });
      if (!result.ok) {
        window.alert(result.message ?? "添削の実行に失敗しました。");
        return;
      }
      onEnqueued?.();
      window.location.reload();
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusySync(false);
    }
  };

  const onQueue = async () => {
    if (!canAct || busySync || busyQueue || activeQueued) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【預ける】キューに入れて空き時間に処理します。\n完了時にメールでお知らせします（約1時間ごとに途中経過も送ります）。\n\nよろしいですか？`,
    );
    if (!ok) return;

    setBusyQueue(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postEnqueueProofread(token, {
        taskId,
        submissionIds: [submissionId],
      });
      if (!result.ok) {
        window.alert(result.message ?? "キュー投入に失敗しました。");
        return;
      }
      onEnqueued?.();
      window.alert(result.message);
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusyQueue(false);
    }
  };

  if (activeQueued) {
    return (
      <button type="button" disabled style={{ ...btnBase, background: "#64748b" }} title="queued">
        queued
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!canAct || busySync || busyQueue}
        title="同期で今すぐ添削（完了まで待つ）"
        onClick={() => void onSync()}
        style={{
          ...btnBase,
          background:
            busySync
              ? "#64748b"
              : staleQueued || status === "processing"
                ? "#ca8a04"
                : canAct
                  ? "#16a34a"
                  : "#94a3b8",
        }}
      >
        {busySync ? "processing…" : staleQueued || status === "processing" ? "今すぐ retry" : "今すぐ"}
      </button>
      <button
        type="button"
        disabled={!canAct || busySync || busyQueue}
        title="キューに預ける（空き時間に処理・メール通知）"
        onClick={() => void onQueue()}
        style={{
          ...btnBase,
          background: busyQueue ? "#64748b" : canAct ? "#2563eb" : "#94a3b8",
        }}
      >
        {busyQueue ? "預け中…" : "預ける"}
      </button>
    </>
  );
}

/** 課題・添削設定などを変えたあと、既に添削済み（done）の提出を Claude で出し直す */
export function RedoProofreadSubmissionButton({
  submissionId,
  taskId,
  studentLabel,
  proofreadQueuedAt,
  status,
  onEnqueued,
}: CommonProps & { status?: string }) {
  const { user } = useFirebaseAuthContext();
  const [busySync, setBusySync] = useState(false);
  const [busyQueue, setBusyQueue] = useState(false);

  const staleQueued = status === "queued" && isStaleQueuedRow({ status, proofreadQueuedAt });
  const activeQueued = status === "queued" && !staleQueued;

  if (activeQueued) return null;

  const onSync = async () => {
    if (busySync || busyQueue) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【今すぐやり直し】既存の AI 添削結果は上書きされます。実行しますか？`,
    );
    if (!ok) return;

    setBusySync(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postRunProofreadSync(token, {
        taskId,
        submissionIds: [submissionId],
        retryFailed: false,
      });
      if (!result.ok) {
        window.alert(result.message ?? "添削の実行に失敗しました。");
        return;
      }
      onEnqueued?.();
      window.location.reload();
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusySync(false);
    }
  };

  const onQueue = async () => {
    if (busySync || busyQueue) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【やり直しを預ける】既存結果は上書きされます。空き時間に処理し、完了時にメールします。よろしいですか？`,
    );
    if (!ok) return;

    setBusyQueue(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postEnqueueProofread(token, {
        taskId,
        submissionIds: [submissionId],
        forceRedo: true,
      });
      if (!result.ok) {
        window.alert(result.message ?? "キュー投入に失敗しました。");
        return;
      }
      onEnqueued?.();
      window.alert(result.message);
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusyQueue(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busySync || busyQueue}
        title="設定変更後に、AI 添削だけを今すぐ出し直す"
        onClick={() => void onSync()}
        style={{ ...btnBase, background: busySync ? "#94a3b8" : "#ca8a04" }}
      >
        {busySync ? "processing…" : staleQueued ? "今すぐ retry" : "やり直し"}
      </button>
      <button
        type="button"
        disabled={busySync || busyQueue}
        title="やり直しをキューに預ける"
        onClick={() => void onQueue()}
        style={{ ...btnBase, background: busyQueue ? "#94a3b8" : "#2563eb" }}
      >
        {busyQueue ? "預け中…" : "やり直しを預ける"}
      </button>
    </>
  );
}

/** queued / processing の取り残しを中止 */
export function CancelProofreadButton({
  submissionId,
  studentLabel,
  status,
  proofreadQueuedAt,
  onCancelled,
}: CommonProps & { status: string }) {
  const { user } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);

  const staleQueued = status === "queued" && isStaleQueuedRow({ status, proofreadQueuedAt });
  const activeQueued = status === "queued" && !staleQueued;
  const show = activeQueued || status === "processing";

  if (!show) return null;

  const onClick = async () => {
    if (busy) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\nこの提出の添削待ちを中止します。\n\n中止してよろしいですか？`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/cancel-proofread", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        window.alert(json?.message ?? "中止に失敗しました。");
        return;
      }
      onCancelled?.();
      window.location.reload();
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      title="queued / processing を中止"
      onClick={() => void onClick()}
      style={{ ...btnBase, background: busy ? "#94a3b8" : "#dc2626" }}
    >
      {busy ? "cancelling…" : "cancel"}
    </button>
  );
}
