"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";

type TicketRow = {
  uid: string;
  displayLabel: string;
  email: string | null;
  kind: "teacher" | "student";
  tickets: number;
  lastProofreadTicketConsume: number | null;
  lastProofreadTicketAt: string | null;
};

type Payload = {
  ok?: boolean;
  organizationId?: string;
  teachers?: TicketRow[];
  students?: TicketRow[];
  teacherCount?: number;
  studentCount?: number;
  note?: string;
  message?: string;
};

function formatIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP");
  } catch {
    return iso;
  }
}

export function AdminTenantTickets() {
  const { user } = useFirebaseAuthContext();
  const uid = user?.uid ?? null;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const u = getFirebaseAuth()?.currentUser;
      if (!u) {
        setError("ログイン情報を取得できませんでした。再読み込みしてください。");
        setData(null);
        return;
      }
      const token = await u.getIdToken();
      const res = await fetch("/api/admin/tenant-ticket-roster", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as Payload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "チケット一覧の取得に失敗しました。");
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setError("通信エラーでチケット一覧を取得できませんでした。");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ADMIN_TENANT_CHANGED_EVENT, onChange);
  }, [load]);

  const rows = useMemo(() => {
    const teachers = data?.teachers ?? [];
    const students = data?.students ?? [];
    return { teachers, students };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="admin-tenant-roster-wrap">
        <p className="muted admin-tenant-roster-loading">チケット一覧を読み込み中…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="admin-tenant-roster-wrap">
        <p className="admin-tenant-roster-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!data?.ok) {
    return null;
  }

  const oid = data.organizationId ?? "—";

  const renderList = (items: TicketRow[]) => {
    if (items.length === 0) return <p className="muted">該当ユーザーがいません。</p>;
    return (
      <ul className="admin-roster-list">
        {items.map((m) => (
          <li key={m.uid}>
            <span>
              {m.displayLabel}{" "}
              <span className="muted admin-roster-meta">
                <code>{m.uid.slice(0, 8)}…</code>
                {m.email ? ` · ${m.email}` : ""}
                {" · "}
                残り <strong>{m.tickets}</strong>
                {m.lastProofreadTicketConsume != null ? ` · 直近消費 ${m.lastProofreadTicketConsume}` : ""}
                {m.lastProofreadTicketAt ? ` · ${formatIso(m.lastProofreadTicketAt)}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <section className="admin-tenant-roster-wrap" aria-labelledby="admin-ticket-heading">
      <div className="card admin-tenant-roster-card">
        <h2 id="admin-ticket-heading" className="admin-tenant-roster-title">
          テナント「<code>{oid}</code>」のチケット残高
        </h2>
        <p className="muted admin-tenant-roster-lead">
          残りは <code>users/{`{uid}`}.billing.tickets</code>。消費は現状「直近1回分」のみ表示します。
        </p>

        <div className="admin-roster-columns">
          <div>
            <h3 className="admin-roster-subheading">
              教員・運用{" "}
              <span className="admin-roster-count">{data.teacherCount ?? rows.teachers.length} 名</span>
            </h3>
            {renderList(rows.teachers)}
          </div>
          <div>
            <h3 className="admin-roster-subheading">
              生徒（想定）{" "}
              <span className="admin-roster-count">{data.studentCount ?? rows.students.length} 名</span>
            </h3>
            {renderList(rows.students)}
          </div>
        </div>

        {data.note ? (
          <p className="muted admin-tenant-roster-note" style={{ marginBottom: 0 }}>
            {data.note}
          </p>
        ) : null}
      </div>
    </section>
  );
}

