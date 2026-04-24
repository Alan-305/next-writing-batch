"use client";

import { useId } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

export type TwoStepDeletePhase = null | "warning" | "confirm";

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const panel: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "20px 22px",
  maxWidth: 420,
  width: "100%",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
  border: "1px solid #e2e8f0",
};

const row: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  flexWrap: "wrap",
  marginTop: 18,
};

const secondaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.9rem",
};

const primaryContinueBtn: CSSProperties = {
  ...secondaryBtn,
  border: "1px solid #b45309",
  background: "#fffbeb",
  color: "#92400e",
};

const yesDeleteBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#dc2626",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.9rem",
};

type Props = {
  phase: TwoStepDeletePhase;
  onDismiss: () => void;
  onContinueFromWarning: () => void;
  warningTitle: string;
  warningBody: ReactNode;
  confirmTitle: string;
  confirmBody: ReactNode;
  onConfirmYes: () => void;
  busy: boolean;
};

export function TwoStepDeleteConfirm({
  phase,
  onDismiss,
  onContinueFromWarning,
  warningTitle,
  warningBody,
  confirmTitle,
  confirmBody,
  onConfirmYes,
  busy,
}: Props) {
  const reactId = useId();
  const warnTitleId = `${reactId}-warn-title`;
  const confirmTitleId = `${reactId}-confirm-title`;

  if (!phase) return null;

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onDismiss();
  };

  if (phase === "warning") {
    return (
      <div style={overlay} role="presentation" onMouseDown={onBackdropMouseDown}>
        <div style={panel} role="alertdialog" aria-labelledby={warnTitleId}>
          <h2 id={warnTitleId} style={{ margin: "0 0 10px", fontSize: "1.1rem", color: "#b45309" }}>
            {warningTitle}
          </h2>
          <div style={{ color: "#334155", fontSize: "0.95rem", lineHeight: 1.55 }}>{warningBody}</div>
          <div style={row}>
            <button type="button" style={secondaryBtn} onClick={onDismiss}>
              キャンセル
            </button>
            <button type="button" style={primaryContinueBtn} onClick={onContinueFromWarning}>
              続ける
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlay} role="presentation" onMouseDown={onBackdropMouseDown}>
      <div style={panel} role="alertdialog" aria-labelledby={confirmTitleId}>
        <h2 id={confirmTitleId} style={{ margin: "0 0 10px", fontSize: "1.1rem", color: "#0f172a" }}>
          {confirmTitle}
        </h2>
        <div style={{ color: "#334155", fontSize: "0.95rem", lineHeight: 1.55 }}>{confirmBody}</div>
        <div style={row}>
          <button type="button" style={secondaryBtn} onClick={onDismiss}>
            いいえ
          </button>
          <button type="button" style={yesDeleteBtn} disabled={busy} onClick={onConfirmYes}>
            はい
          </button>
        </div>
      </div>
    </div>
  );
}
