"use client";

import { useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type CommonProps = {
  submissionId: string;
  taskId: string;
  studentLabel: string;
};

type Props = CommonProps & {
  status: string;
};

async function postRunProofread(
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
    message?: string;
    stderr?: string;
    stdout?: string;
  };
  if (!res.ok) {
    let msg = json?.message ?? "添削の実行に失敗しました。";
    const errTail = (json.stderr ?? "").trim();
    if (errTail) {
      const short = errTail.length > 1500 ? `${errTail.slice(0, 1500)}…` : errTail;
      msg += `\n\n──── サーバーからの詳細（コピーして相談に使えます）────\n${short}`;
    }
    return { ok: false, message: msg };
  }
  return { ok: true };
}

export function ProofreadSubmissionButton({ submissionId, taskId, studentLabel, status }: Props) {
  const { user } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);

  const canRun =
    status === "pending" || status === "failed" || status === "processing";

  const onClick = async () => {
    if (!canRun || busy) return;
    const stuck =
      status === "processing"
        ? "\n\n※ 状態が「processing」のままのときは、前回が途中で止まった可能性があります。このまま再実行してよいですか？"
        : "";
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\nこの1件だけ添削バッチを実行します。よろしいですか？${stuck}`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postRunProofread(token, {
        taskId,
        submissionIds: [submissionId],
        retryFailed: status === "failed" || status === "processing",
      });
      if (!result.ok) {
        window.alert(result.message ?? "添削の実行に失敗しました。");
        return;
      }
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
      disabled={!canRun || busy}
      title={
        canRun
          ? "この提出だけ添削（Claude バッチ）。processing の取り残しも再実行できます"
          : "pending / failed / processing のとき実行できます（済みは「添削やり直し」）"
      }
      onClick={() => void onClick()}
      style={{
        padding: "8px 12px",
        fontSize: "0.9rem",
        background: canRun ? "#16a34a" : "#94a3b8",
        color: "#fff",
      }}
    >
      {busy ? "添削中…" : "添削"}
    </button>
  );
}

/** 課題・添削設定などを変えたあと、既に添削済み（done）の提出を Claude で出し直す */
export function RedoProofreadSubmissionButton({ submissionId, taskId, studentLabel }: CommonProps) {
  const { user } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    const ok = window.confirm(
      `${studentLabel}\n受付ID: ${submissionId}\n\n` +
        "【添削やり直し】既存の AI 添削結果は上書きされます。\n" +
        "課題マスタ・添削設定・プロンプトを変更した後の再生成向けです。実行しますか？",
    );
    if (!ok) return;

    setBusy(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const result = await postRunProofread(token, {
        taskId,
        submissionIds: [submissionId],
        retryFailed: false,
      });
      if (!result.ok) {
        window.alert(result.message ?? "添削の実行に失敗しました。");
        return;
      }
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
      title="設定変更後に、AI 添削だけを出し直します（結果は上書き）"
      onClick={() => void onClick()}
      style={{
        padding: "8px 12px",
        fontSize: "0.9rem",
        background: busy ? "#94a3b8" : "#ca8a04",
        color: "#fff",
      }}
    >
      {busy ? "やり直し中…" : "添削やり直し"}
    </button>
  );
}
