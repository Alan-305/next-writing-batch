"use client";

import Link from "next/link";

import { OpsSubmissionCountsCard } from "@/components/ops/OpsSubmissionCountsCard";
import { useOpsTenantRoster } from "@/lib/ops/tenant-ticket-roster-client";

export default function OpsSubmissionCountsPage() {
  const { data, loading, error } = useOpsTenantRoster();

  return (
    <main>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 教員ダッシュボード</Link>
      </p>
      <h1>提出状況（課題別）</h1>

      {loading ? <p className="muted">読み込み中…</p> : null}
      {error ? (
        <p className="admin-tenant-roster-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && data?.ok ? <OpsSubmissionCountsCard data={data} /> : null}
    </main>
  );
}
