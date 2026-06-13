"use client";

import {
  formatOpsIso,
  type OpsTenantRosterPayload,
  type OpsTicketRow,
} from "@/lib/ops/tenant-ticket-roster-client";

type Props = {
  data: OpsTenantRosterPayload;
};

function renderTeacherList(items: OpsTicketRow[]) {
  if (items.length === 0) return <p className="muted">該当ユーザーがいません。</p>;
  return (
    <ul className="admin-roster-list">
      {items.map((m) => (
        <li key={m.uid}>
          <span>{m.displayLabel}</span>
          <span className="ops-ticket-balance" aria-label={`チケット残${m.tickets}枚`}>
            チケット残<span className="ops-ticket-balance__count">{m.tickets}</span>枚
          </span>
          <span className="muted admin-roster-meta">
            <code>{m.uid.slice(0, 8)}…</code>
            {m.email ? ` · ${m.email}` : ""}
            {m.lastProofreadTicketConsume != null ? ` · 直近消費 ${m.lastProofreadTicketConsume}` : ""}
            {m.lastProofreadTicketAt ? ` · ${formatOpsIso(m.lastProofreadTicketAt)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OpsTeacherRosterCard({ data }: Props) {
  return (
    <div className="card admin-tenant-roster-card">
      <p className="muted admin-tenant-roster-lead">
        テナント <code>{data.organizationId ?? "—"}</code> の教員（チケット残高）です。
      </p>
      <h2 className="admin-roster-subheading">
        教員・運用{" "}
        <span className="admin-roster-count">{data.teacherCount ?? data.teachers?.length ?? 0} 名</span>
      </h2>
      {renderTeacherList(data.teachers ?? [])}
      {data.note ? (
        <p className="muted admin-tenant-roster-note" style={{ marginBottom: 0 }}>
          {data.note}
        </p>
      ) : null}
    </div>
  );
}
