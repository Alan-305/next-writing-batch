"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { OpsInviteLinkCard } from "@/components/ops/OpsInviteLinkCard";
import { OpsTenantIdCard } from "@/components/ops/OpsTenantIdCard";
import { useOpsTenantRoster } from "@/lib/ops/tenant-ticket-roster-client";

function OpsInvitePageInner() {
  const { data, loading, error } = useOpsTenantRoster();
  const searchParams = useSearchParams();
  const tenantCreatedWelcome = searchParams.get("tenantCreated") === "1";

  return (
    <main>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 教員ダッシュボード</Link>
      </p>
      <h1>生徒招待リンク</h1>

      {tenantCreatedWelcome ? (
        <p className="success" style={{ marginBottom: 16 }}>
          テナントを作成しました。下記の「テナント ID」を控えてください（サポートや設定確認に使います）。
        </p>
      ) : null}

      {error ? (
        <p className="admin-tenant-roster-error" role="alert">
          {error}
        </p>
      ) : null}

      <OpsTenantIdCard organizationId={data?.organizationId} loading={loading} />
      <OpsInviteLinkCard organizationId={data?.organizationId} loading={loading} />
    </main>
  );
}

export default function OpsInvitePage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <OpsInvitePageInner />
    </Suspense>
  );
}
