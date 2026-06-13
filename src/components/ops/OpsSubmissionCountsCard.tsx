"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatRegisteredTaskDropdownLabel } from "@/lib/registered-task-display";
import {
  formatOpsIso,
  sortSubmissionRows,
  SUBMISSION_SORT_OPTIONS,
  type OpsTenantRosterPayload,
  type SubmissionSort,
} from "@/lib/ops/tenant-ticket-roster-client";

type Props = {
  data: OpsTenantRosterPayload;
};

export function OpsSubmissionCountsCard({ data }: Props) {
  const [submissionSort, setSubmissionSort] = useState<SubmissionSort>("count_desc");

  const sortedSubmissionRows = useMemo(() => {
    const rows = data.submissionCountsByTaskId ?? [];
    return sortSubmissionRows(rows, submissionSort);
  }, [data.submissionCountsByTaskId, submissionSort]);

  return (
    <div className="card admin-tenant-roster-card">
      <p className="muted admin-tenant-roster-lead">
        匿名招待リンクからの提出を、課題ごとに集計しています。個別の添削作業は
        <Link href="/ops/submissions">提出一覧</Link> から行ってください。
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h2 className="admin-roster-subheading" style={{ margin: 0 }}>
          匿名提出（課題別・累計）{" "}
          <span className="admin-roster-count">{data.anonymousSubmissionTotal ?? 0} 件</span>
        </h2>
        {(data.submissionCountsByTaskId ?? []).length > 0 ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.95rem" }}>
            <span className="muted">並べ替え</span>
            <select
              value={submissionSort}
              onChange={(e) => setSubmissionSort(e.target.value as SubmissionSort)}
              style={{ minHeight: 40, padding: "6px 10px" }}
            >
              {SUBMISSION_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {(data.submissionCountsByTaskId ?? []).length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          まだ提出はありません。
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>
                  課題（登録一覧と同じ表示）
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>提出件数</th>
                <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0" }}>最終提出</th>
              </tr>
            </thead>
            <tbody>
              {sortedSubmissionRows.map((row) => (
                <tr key={row.taskId}>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", lineHeight: 1.5 }}>
                    {formatRegisteredTaskDropdownLabel(row.taskId, row.displayLabel)}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "right", fontWeight: 700 }}>
                    {row.count}
                  </td>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9" }} className="muted">
                    {formatOpsIso(row.latestSubmittedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
