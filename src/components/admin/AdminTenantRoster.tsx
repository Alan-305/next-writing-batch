"use client";

import { useCallback, useEffect, useState } from "react";

import { ADMIN_TENANT_CHANGED_EVENT } from "@/lib/admin/admin-tenant-events";
import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Member = {
  uid: string;
  displayLabel: string;
  email: string | null;
  roles: string[];
  kind: "teacher" | "student";
};

type RosterPayload = {
  ok?: boolean;
  organizationId?: string;
  teachers?: Member[];
  students?: Member[];
  teacherCount?: number;
  studentCount?: number;
  note?: string;
  message?: string;
};

function mailtoHref(email: string, subject: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}`;
}

export function AdminTenantRoster() {
  const { user } = useFirebaseAuthContext();
  const uid = user?.uid ?? null;

  const [data, setData] = useState<RosterPayload | null>(null);
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
      const res = await fetch("/api/admin/tenant-roster", { headers: { Authorization: `Bearer ${token}` } });
      const j = (await res.json()) as RosterPayload;
      if (!res.ok || !j?.ok) {
        setError(j?.message ?? "名簿の取得に失敗しました。");
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setError("通信エラーで名簿を取得できませんでした。");
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

  if (loading && !data) {
    return (
      <div className="admin-tenant-roster-wrap">
        <p className="muted admin-tenant-roster-loading">テナント名簿を読み込み中…</p>
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
    return (
      <div className="admin-tenant-roster-wrap">
        <div className="card admin-tenant-roster-card">
          <p className="muted" style={{ margin: 0 }}>
            名簿を表示できませんでした。テナントを切り替えるか、ページを再読み込みしてください。
          </p>
        </div>
      </div>
    );
  }

  const oid = data.organizationId ?? "—";
  const subjectTeacher = `【Next Writing Batch】テナント「${oid}」について`;
  const subjectStudent = `【Next Writing Batch】テナント「${oid}」について（生徒様）`;

  const renderMemberRow = (m: Member, subject: string) => {
    const mail = m.email?.trim();
    if (mail) {
      return (
        <a className="admin-roster-mail-link" href={mailtoHref(mail, subject)}>
          {m.displayLabel}
        </a>
      );
    }
    return (
      <span className="admin-roster-no-mail" title="Firebase Auth にメールがありません">
        {m.displayLabel}
        <span className="muted">（メールなし）</span>
      </span>
    );
  };

  return (
    <section className="admin-tenant-roster-wrap" aria-labelledby="admin-roster-heading">
      <div className="card admin-tenant-roster-card">
        <h2 id="admin-roster-heading" className="admin-tenant-roster-title">
          テナント「<code>{oid}</code>」の名簿
        </h2>
        <p className="muted admin-tenant-roster-lead">
          名前をクリックすると、既定のメールアプリで宛先が開きます（ブラウザの mailto）。教員は roles に{" "}
          <code>teacher</code> または <code>admin</code> のユーザー、または課題設定を保存した UID も含みます。
        </p>

        <div className="admin-roster-columns">
          <div>
            <h3 className="admin-roster-subheading">
              教員・運用{" "}
              <span className="admin-roster-count">
                {data.teacherCount ?? data.teachers?.length ?? 0} 名
              </span>
            </h3>
            {(data.teachers?.length ?? 0) === 0 ? (
              <p className="muted">該当ユーザーがいません。</p>
            ) : (
              <ul className="admin-roster-list">
                {(data.teachers ?? []).map((m) => (
                  <li key={m.uid}>
                    {renderMemberRow(m, subjectTeacher)}
                    <span className="muted admin-roster-meta">
                      {" "}
                      <code>{m.uid.slice(0, 8)}…</code>
                      {m.roles.length ? ` · ${m.roles.join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="admin-roster-subheading">
              生徒（想定）{" "}
              <span className="admin-roster-count">{data.studentCount ?? data.students?.length ?? 0} 名</span>
            </h3>
            {(data.students?.length ?? 0) === 0 ? (
              <p className="muted">該当ユーザーがいません。</p>
            ) : (
              <ul className="admin-roster-list">
                {(data.students ?? []).map((m) => (
                  <li key={m.uid}>
                    {renderMemberRow(m, subjectStudent)}
                    <span className="muted admin-roster-meta">
                      {" "}
                      <code>{m.uid.slice(0, 8)}…</code>
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
