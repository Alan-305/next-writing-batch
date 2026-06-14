"use client";

import { useCallback, useEffect, useState } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";

export type OpsTicketRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  kind: "teacher" | "student";
  tickets: number;
  ticketExpiresAt: string | null;
  lastProofreadTicketConsume: number | null;
  lastProofreadTicketAt: string | null;
};

export type OpsTenantRosterPayload = {
  ok?: boolean;
  organizationId?: string;
  teachers?: OpsTicketRow[];
  students?: OpsTicketRow[];
  teacherCount?: number;
  studentCount?: number;
  anonymousSubmissionTotal?: number;
  submissionCountsByTaskId?: Array<{
    taskId: string;
    displayLabel: string;
    count: number;
    latestSubmittedAt: string;
  }>;
  note?: string;
  message?: string;
};

export const SUBMISSION_SORT_OPTIONS = [
  { value: "count_desc", label: "提出件数（多い順）" },
  { value: "count_asc", label: "提出件数（少ない順）" },
  { value: "latest_desc", label: "最終提出（新しい順）" },
  { value: "latest_asc", label: "最終提出（古い順）" },
  { value: "task_asc", label: "課題ID（昇順）" },
] as const;

export type SubmissionSort = (typeof SUBMISSION_SORT_OPTIONS)[number]["value"];

export function formatOpsIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export function sortSubmissionRows(
  rows: NonNullable<OpsTenantRosterPayload["submissionCountsByTaskId"]>,
  sort: SubmissionSort,
) {
  const copy = [...rows];
  switch (sort) {
    case "count_desc":
      return copy.sort((a, b) => b.count - a.count || a.taskId.localeCompare(b.taskId, "ja"));
    case "count_asc":
      return copy.sort((a, b) => a.count - b.count || a.taskId.localeCompare(b.taskId, "ja"));
    case "latest_desc":
      return copy.sort(
        (a, b) => b.latestSubmittedAt.localeCompare(a.latestSubmittedAt) || b.count - a.count,
      );
    case "latest_asc":
      return copy.sort(
        (a, b) => a.latestSubmittedAt.localeCompare(b.latestSubmittedAt) || a.taskId.localeCompare(b.taskId, "ja"),
      );
    case "task_asc":
      return copy.sort((a, b) => a.taskId.localeCompare(b.taskId, "ja"));
    default:
      return copy;
  }
}

export function useOpsTenantRoster() {
  const [data, setData] = useState<OpsTenantRosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user) {
        setError("ログイン情報を取得できませんでした。再読み込みしてください。");
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch("/api/ops/tenant-ticket-roster", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as OpsTenantRosterPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "テナント情報の取得に失敗しました。");
        return;
      }
      setData(j);
    } catch {
      setError("通信エラーでテナント情報を取得できませんでした。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
