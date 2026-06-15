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

/** キュー投入型の添削開始ボタン */
export function ProofreadSubmissionButton({
  submissionId,
  taskId,
  studentLabel,
  status,
  proofreadQueuedAt,
  onEnqueued,
}: Props) {
  const { user } = useFirebaseAuthContext();
  const [busyQueue, setBusyQueue] = useState(false);

  const staleQueued = status === "queued" && isStaleQueuedRow({ status, proofreadQueuedAt });
  const activeQueued = status === "queued" && !staleQueued;

  const canAct =
    status === "pending" ||
    status === "failed" ||
    staleQueued ||
    status === "processing";

  const onQueue = async () => {
    if (!canAct || busyQueue || activeQueued) return;
    const stuck =
      status === "processing" || staleQueued
        ? "\n\n※ 前回の処理が途中で止まった可能性があります。このまま再実行してよろしいですか？"
        : "";
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【添削開始】空き時間に処理します。完了時にメールでお知らせします。${stuck}\n\nよろしいですか？`,
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
    <button
      type="button"
      disabled={!canAct || busyQueue}
      title="空き時間に処理・メール通知"
      className={`ops-btn ${busyQueue ? "ops-btn--muted" : canAct ? "ops-btn--queue" : "ops-btn--muted"}`}
      onClick={() => void onQueue()}
    >
      {busyQueue ? OPS_COPY.proofreadStartBusy : OPS_COPY.proofreadStart}
    </button>
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
  const [busyQueue, setBusyQueue] = useState(false);

  const staleQueued = status === "queued" && isStaleQueuedRow({ status, proofreadQueuedAt });
  const activeQueued = status === "queued" && !staleQueued;

  if (activeQueued) return null;

  const onQueue = async () => {
    if (busyQueue) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n【再添削】空き時間に処理し、既存の AI 添削結果は上書きされます。完了時にメールでお知らせします。\n\nよろしいですか？`,
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
    <button
      type="button"
      disabled={busyQueue}
      title="再添削をキューに預ける"
      className={`ops-btn ${busyQueue ? "ops-btn--muted" : "ops-btn--warn"}`}
      onClick={() => void onQueue()}
    >
      {busyQueue ? OPS_COPY.proofreadStartBusy : OPS_COPY.redoProofread}
    </button>
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
      className={`ops-btn ${busy ? "ops-btn--muted" : "ops-btn--danger-soft"}`}
      onClick={() => void onClick()}
    >
      {busy ? OPS_COPY.cancelBusy : OPS_COPY.cancel}
    </button>
  );
}
