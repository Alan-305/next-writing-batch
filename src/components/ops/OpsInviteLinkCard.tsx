"use client";

import { useState } from "react";

type Props = {
  organizationId: string | undefined;
  loading: boolean;
};

export function OpsInviteLinkCard({ organizationId, loading }: Props) {
  const [inviteCopied, setInviteCopied] = useState(false);

  const inviteUrl =
    typeof window !== "undefined" && organizationId
      ? `${window.location.origin}/submit?org=${encodeURIComponent(organizationId)}`
      : "";
  const inviteMailTo = inviteUrl
    ? `mailto:?subject=${encodeURIComponent("添削革命 招待リンク")}&body=${encodeURIComponent(
        `以下のリンクから英文を提出してください（ログイン不要）。\n\n${inviteUrl}\n\n提出後に表示される「ニックネーム」と「引換ID」を必ず保存してください。`,
      )}`
    : "";
  const inviteQrUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteUrl)}`
    : "";

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setInviteCopied(false);
    }
  };

  return (
    <div className="card admin-tenant-roster-card">
      <p className="muted admin-tenant-roster-lead">
        生徒にこのリンクを共有すると、<strong>Google ログイン不要</strong>で英文を提出できます。提出後に表示されるニックネームと引換IDで結果を確認します。
      </p>
      <p style={{ wordBreak: "break-all", marginTop: 0 }}>
        <code>{loading ? "読み込み中..." : inviteUrl || "—"}</code>
      </p>
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 0 }}>
        <button type="button" onClick={() => void copyInvite()} disabled={loading || !inviteUrl}>
          {inviteCopied ? "コピーしました" : "リンクをコピー"}
        </button>
        <a className="button secondary" href={inviteMailTo || "#"} onClick={(e) => !inviteMailTo && e.preventDefault()}>
          メールで共有
        </a>
      </p>
      {inviteQrUrl ? (
        <div>
          <img src={inviteQrUrl} alt="生徒招待リンクのQRコード" width={220} height={220} />
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            生徒の端末でQRを読み取ってもらうと、同じ招待リンクを開けます。
          </p>
        </div>
      ) : null}
    </div>
  );
}
