"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import {
  formatTeacherTicketExpiryLabel,
  resolveTeacherTicketStatus,
} from "@/lib/billing/teacher-ticket-status";
import { isTeacherByRoles } from "@/lib/auth/user-roles";

export function TeacherTicketStatusBanner() {
  const { roles, profile, profileLoading } = useFirebaseAuthContext();

  const status = useMemo(
    () => resolveTeacherTicketStatus(profile?.billing as Record<string, unknown> | undefined),
    [profile?.billing],
  );

  if (profileLoading || !isTeacherByRoles(roles)) return null;
  if (!status.isExpired) return null;

  const expiryLabel = formatTeacherTicketExpiryLabel(status.nearestExpiryIso);

  return (
    <div
      className="ops-ticket-status-banner"
      role="alert"
      style={{
        margin: "0 0 16px",
        padding: "14px 16px",
        borderRadius: 8,
        border: "1px solid #f87171",
        background: "linear-gradient(180deg, #fef2f2 0%, #fff 100%)",
        color: "#7f1d1d",
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>チケットの有効期限が切れています</p>
      <p style={{ margin: "8px 0 0", fontSize: "0.95rem" }}>
        添削の確定・公開はチケットが必要です。残りは <strong>{status.tickets}</strong> 枚
        {status.nearestExpiryIso ? <>（直近の期限: {expiryLabel}）</> : null}
        です。チケットを購入してから再度お試しください。
      </p>
      <p style={{ margin: "12px 0 0" }}>
        <Link
          href="/ops/tickets"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            padding: "10px 16px",
            borderRadius: 6,
            background: "#dc2626",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          チケットを購入する
        </Link>
      </p>
    </div>
  );
}
