"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { OpsTeacherRosterCard } from "@/components/ops/OpsTeacherRosterCard";
import { OpsTicketPurchaseCard } from "@/components/ops/OpsTicketPurchaseCard";
import { useOpsTenantRoster } from "@/lib/ops/tenant-ticket-roster-client";

function OpsTicketsPageInner() {
  const { data, loading, error } = useOpsTenantRoster();
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");

  return (
    <main>
      <p className="muted" style={{ marginTop: 0 }}>
        <Link href="/ops">← 教員ダッシュボード</Link>
      </p>
      <h1>チケット購入</h1>

      {checkoutResult === "success" ? (
        <p className="success" style={{ marginBottom: 16 }}>
          購入が完了しました。反映まで少し時間がかかる場合があります。下の残数をご確認ください。
        </p>
      ) : checkoutResult === "cancel" ? (
        <p className="muted" style={{ marginBottom: 16 }}>
          購入をキャンセルしました。
        </p>
      ) : null}

      <OpsTicketPurchaseCard />

      {loading ? <p className="muted">残数を読み込み中…</p> : null}
      {error ? (
        <p className="admin-tenant-roster-error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && data?.ok ? <OpsTeacherRosterCard data={data} /> : null}
    </main>
  );
}

export default function OpsTicketsPage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <OpsTicketsPageInner />
    </Suspense>
  );
}
