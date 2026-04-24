"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties } from "react";

import { TwoStepDeleteConfirm, type TwoStepDeletePhase } from "@/components/TwoStepDeleteConfirm";

type Props = { fileName: string };

const downloadBtn: CSSProperties = {
  display: "inline-block",
  background: "#16a34a",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  fontSize: "0.9rem",
  fontWeight: 600,
  border: "none",
};

const deleteBtn: CSSProperties = {
  background: "#dc2626",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 8,
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
  border: "none",
};

export function DeliverablesZipRowActions({ fileName }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<TwoStepDeletePhase>(null);

  async function executeDelete() {
    setDialog(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/deliverables/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.message === "string" ? body.message : `エラー (${res.status})`;
        window.alert(msg);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <a
          href={`/api/deliverables/${encodeURIComponent(fileName)}`}
          style={downloadBtn}
          download={fileName}
        >
          ダウンロード
        </a>
        <button type="button" style={deleteBtn} disabled={busy} onClick={() => setDialog("warning")}>
          {busy ? "削除中…" : "削除"}
        </button>
      </div>

      <TwoStepDeleteConfirm
        phase={dialog}
        onDismiss={() => setDialog(null)}
        onContinueFromWarning={() => setDialog("confirm")}
        warningTitle="注意"
        warningBody={
          <>
            <p style={{ margin: 0, lineHeight: 1.55 }}>
              納品ZIP「<code>{fileName}</code>」を<strong>サーバー上から完全に削除</strong>しようとしています。
              削除すると<strong>元に戻せません</strong>（ゴミ箱には入りません）。
            </p>
            <p style={{ margin: "12px 0 0", lineHeight: 1.55, color: "#64748b", fontSize: "0.9rem" }}>
              続ける場合は次の画面で「はい」を押すまで削除は実行されません。
            </p>
          </>
        }
        confirmTitle="最終確認"
        confirmBody={
          <p style={{ margin: 0, lineHeight: 1.55 }}>
            本当に「<code>{fileName}</code>」を<strong>削除</strong>しますか？
          </p>
        }
        onConfirmYes={executeDelete}
        busy={busy}
      />
    </>
  );
}
