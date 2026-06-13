"use client";

import { useState } from "react";

type Props = {
  organizationId: string | undefined;
  loading: boolean;
};

export function OpsTenantIdCard({ organizationId, loading }: Props) {
  const [tenantIdCopied, setTenantIdCopied] = useState(false);

  const copyTenantId = async () => {
    const id = (organizationId ?? "").trim();
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setTenantIdCopied(true);
      window.setTimeout(() => setTenantIdCopied(false), 1800);
    } catch {
      setTenantIdCopied(false);
    }
  };

  return (
    <div className="card admin-tenant-roster-card" style={{ marginBottom: 16 }}>
      <h2 className="admin-roster-subheading" style={{ marginTop: 0 }}>
        あなたのテナント ID
      </h2>
      <p className="muted admin-tenant-roster-lead">
        提出・チケット・招待はこの ID（Firestore の <code>organizationId</code>）単位で分かれます。
      </p>
      <p style={{ wordBreak: "break-all", marginTop: 0 }}>
        <code>{loading ? "読み込み中..." : organizationId ?? "—"}</code>
      </p>
      <p style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 0 }}>
        <button type="button" onClick={() => void copyTenantId()} disabled={loading || !organizationId}>
          {tenantIdCopied ? "コピーしました" : "テナント ID をコピー"}
        </button>
      </p>
    </div>
  );
}
