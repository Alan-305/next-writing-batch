"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";

export function RegisterTeacherClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/ops/tickets";

  const { user, authLoading, profileLoading, roles } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isTeacher = useMemo(() => isTeacherByRoles(roles), [roles]);
  const isStudent = useMemo(() => roles.some((r) => r.toLowerCase() === "student"), [roles]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/register/teacher", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ createNewTenant: true }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; organizationId?: string };
      if (!res.ok || !j.ok) {
        setMessage(j.message ?? "登録に失敗しました。");
        return;
      }
      const q = new URLSearchParams();
      q.set("tenantCreated", "1");
      const sep = safeNext.includes("?") ? "&" : "?";
      router.replace(`${safeNext}${sep}${q.toString()}`);
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <main>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    const signInHref = `/sign-in?next=${encodeURIComponent(`/register/teacher?next=${encodeURIComponent(safeNext)}`)}`;
    return (
      <main>
        <h1>教員としてテナントを作成</h1>
        <p className="muted">続けるには Google でログインしてください。</p>
        <p>
          <Link href={signInHref}>ログインへ</Link>
        </p>
        <p className="muted" style={{ marginTop: 24 }}>
          <Link href="/hub">ハブへ戻る</Link>
        </p>
      </main>
    );
  }

  if (isStudent && !isTeacher) {
    return (
      <main>
        <h1>教員としてテナントを作成</h1>
        <p className="error">
          このアカウントは生徒として登録されています。教員用に別の Google アカウントを使うか、管理者に依頼してください。
        </p>
        <p>
          <Link href="/hub">ハブへ戻る</Link>
        </p>
      </main>
    );
  }

  if (isTeacher) {
    return (
      <main>
        <h1>教員としてテナントを作成</h1>
        <p className="muted">すでに教員として登録されています。</p>
        <p>
          <Link href={safeNext}>運用画面へ（{safeNext}）</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>教員としてテナントを作成</h1>
      <p className="student-page-lead">
        初回のみ、システムが<strong>テナント ID</strong>（organizationId）を自動で発行します。作成後、運用画面に表示される ID
        を控えてください（生徒招待リンクはそのテナントに紐づきます）。
      </p>

      <form className="card" onSubmit={(ev) => void onSubmit(ev)}>
        <button type="submit" disabled={busy}>
          {busy ? "処理中…" : "テナントを作成して始める"}
        </button>
      </form>

      {message ? <p className="error">{message}</p> : null}

      <p className="muted" style={{ marginTop: 24 }}>
        <Link href="/hub">ハブへ戻る</Link>
      </p>
    </main>
  );
}
