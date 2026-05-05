"use client";

import { useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { TwoStepDeleteConfirm, type TwoStepDeletePhase } from "@/components/TwoStepDeleteConfirm";

type Props = {
  submissionId: string;
  confirmLabel: string;
};

/**
 * 削除後は router.refresh() ではなくフルリロードする。
 * dev の HMR と .next のチャンク番号がズレたときに Cannot find module './NNN.js' が出るのを避ける。
 */
export function DeleteSubmissionButton({ submissionId, confirmLabel }: Props) {
  const { user } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<TwoStepDeletePhase>(null);

  async function executeDelete() {
    setDialog(null);
    setBusy(true);
    try {
      if (!user) {
        window.alert("ログインしてください。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok) {
        window.alert(json?.message ?? "削除に失敗しました。");
        return;
      }
      window.location.reload();
    } catch {
      window.alert("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setDialog("warning")}
        style={{
          padding: "8px 12px",
          fontSize: "0.9rem",
          background: busy ? "#94a3b8" : "#dc2626",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          cursor: busy ? "not-allowed" : "pointer",
          fontWeight: 600,
        }}
      >
        {busy ? "削除中…" : "削除"}
      </button>

      <TwoStepDeleteConfirm
        phase={dialog}
        onDismiss={() => setDialog(null)}
        onContinueFromWarning={() => setDialog("confirm")}
        warningTitle="注意"
        warningBody={
          <>
            <p style={{ margin: 0, lineHeight: 1.55 }}>
              次の提出を<strong>データから完全に削除</strong>しようとしています。削除すると
              <strong>元に戻せません</strong>（ゴミ箱には入りません）。
            </p>
            <p
              style={{
                margin: "10px 0 0",
                padding: "10px 12px",
                background: "#f8fafc",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: "0.9rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {confirmLabel}
            </p>
            <p style={{ margin: "12px 0 0", lineHeight: 1.55, color: "#64748b", fontSize: "0.9rem" }}>
              続ける場合は次の画面で「はい」を押すまで削除は実行されません。
            </p>
          </>
        }
        confirmTitle="最終確認"
        confirmBody={
          <>
            <p style={{ margin: 0, lineHeight: 1.55 }}>
              本当にこの提出を<strong>削除</strong>しますか？
            </p>
            <p style={{ margin: "10px 0 0", lineHeight: 1.55, fontSize: "0.9rem" }}>
              受付ID: <code>{submissionId}</code>
            </p>
            <p
              style={{
                margin: "8px 0 0",
                padding: "8px 10px",
                background: "#f8fafc",
                borderRadius: 8,
                fontSize: "0.88rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {confirmLabel}
            </p>
          </>
        }
        onConfirmYes={executeDelete}
        busy={busy}
      />
    </>
  );
}
