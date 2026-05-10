"use client";

import QRCode from "react-qr-code";
import { useEffect, useState } from "react";

type Props = {
  /** `<a href>` と同じ音声リンク（相対可） */
  audioHref: string;
  /** SSR で組み立てた絶対 URL（あれば初回から QR を描画） */
  serverAbsolute?: string;
};

export function StudentResultAudioQr({ audioHref, serverAbsolute }: Props) {
  const [value, setValue] = useState(() => {
    const s = serverAbsolute?.trim() ?? "";
    if (s) return s;
    const h = audioHref.trim();
    if (h.startsWith("http://") || h.startsWith("https://")) return h;
    return "";
  });

  useEffect(() => {
    if (serverAbsolute?.trim()) return;
    const h = audioHref.trim();
    if (!h) return;
    if (h.startsWith("http://") || h.startsWith("https://")) {
      setValue(h);
      return;
    }
    setValue(new URL(h, window.location.origin).href);
  }, [audioHref, serverAbsolute]);

  if (!value) {
    return (
      <div className="student-result-qr-img-wrap" aria-hidden="true">
        <div style={{ width: 220, height: 220 }} />
      </div>
    );
  }

  return (
    <div className="student-result-qr-img-wrap">
      <QRCode
        value={value}
        size={220}
        level="M"
        style={{ height: "auto", maxWidth: "100%", width: 220 }}
      />
    </div>
  );
}
