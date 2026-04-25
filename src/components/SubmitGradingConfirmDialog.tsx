"use client";

import { useId } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

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
  maxWidth: 440,
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

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.9rem",
};

type Props = {
  open: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  busy: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function SubmitGradingConfirmDialog({
  open,
  onDismiss,
  onConfirm,
  busy,
  title,
  children,
  confirmLabel = "送信を確定",
  cancelLabel = "キャンセル",
}: Props) {
  const reactId = useId();
  const titleId = `${reactId}-title`;

  if (!open) return null;

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onDismiss();
  };

  return (
    <div style={overlay} role="presentation" onMouseDown={onBackdropMouseDown}>
      <div style={panel} role="alertdialog" aria-labelledby={titleId} aria-modal="true">
        <h2 id={titleId} style={{ margin: "0 0 10px", fontSize: "1.1rem", color: "#0f172a" }}>
          {title}
        </h2>
        <div style={{ color: "#334155", fontSize: "0.95rem", lineHeight: 1.55 }}>{children}</div>
        <div style={row}>
          <button type="button" style={secondaryBtn} disabled={busy} onClick={onDismiss}>
            {cancelLabel}
          </button>
          <button type="button" style={primaryBtn} disabled={busy} onClick={onConfirm}>
            {busy ? "送信中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
