"use client";

import { useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isStaleQueuedRow } from "@/lib/proofread/proofread-job-types";
import { OPS_COPY } from "@/lib/ops/submission-status-labels";

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
      msg += `\n\n──── 詳細 ────\n${short}`;
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
      "添削をキューに預けました。完了時にメールでお知らせします。",
  };
}

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
      `${studentLabel}\n受付ID: ${submissionId}\n\n【預ける】空き時間に処理します。完了時にメールでお知らせします。\n\nよろしいですか？`,
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
      <button type="button" disabled className="ops-btn ops-btn--muted" title="待機中">
        {OPS_COPY.waitingInQueue}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={!canAct || busySync || busyQueue}
        title="空き時間に処理・メール通知"
        className={`ops-btn ${busyQueue ? "ops-btn--muted" : canAct ? "ops-btn--queue" : "ops-btn--muted"}`}
        onClick={() => void onQueue()}
      >
        {busyQueue ? OPS_COPY.proofreadQueueBusy : OPS_COPY.proofreadQueue}
      </button>
      <button
        type="button"
        disabled={!canAct || busySync || busyQueue}
        title="完了までこの画面で待つ"
        className={`ops-btn ${busySync ? "ops-btn--muted" : staleQueued || status === "processing" ? "ops-btn--warn" : canAct ? "ops-btn--now" : "ops-btn--muted"}`}
        onClick={() => void onSync()}
      >
        {busySync
          ? OPS_COPY.proofreadNowBusy
          : staleQueued || status === "processing"
            ? OPS_COPY.proofreadRetryNow
            : OPS_COPY.proofreadNow}
      </button>
    </>
  );
}

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
      `${studentLabel}\n受付ID: ${submissionId}\n\n【やり直し】既存の AI 添削結果は上書きされます。実行しますか？`,
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
      `${studentLabel}\n受付ID: ${submissionId}\n\n【預けてやり直し】空き時間に処理し、完了時にメールします。よろしいですか？`,
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
        title="やり直しをキューに預ける"
        className={`ops-btn ${busyQueue ? "ops-btn--muted" : "ops-btn--queue"}`}
        onClick={() => void onQueue()}
      >
        {busyQueue ? OPS_COPY.proofreadQueueBusy : OPS_COPY.redoQueue}
      </button>
      <button
        type="button"
        disabled={busySync || busyQueue}
        title="設定変更後に AI 添削を出し直す"
        className={`ops-btn ${busySync ? "ops-btn--muted" : "ops-btn--warn"}`}
        onClick={() => void onSync()}
      >
        {busySync ? OPS_COPY.proofreadNowBusy : OPS_COPY.redo}
      </button>
    </>
  );
}

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
      `${studentLabel}\n受付ID: ${submissionId}\n\n添削待ちを中止します。よろしいですか？`,
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
      title="待機中・添削中を中止"
      className={`ops-btn ${busy ? "ops-btn--muted" : "ops-btn--danger"}`}
      onClick={() => void onClick()}
    >
      {busy ? OPS_COPY.cancelBusy : OPS_COPY.cancel}
    </button>
  );
}
