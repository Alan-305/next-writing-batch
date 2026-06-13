"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { needsTeacherTenantSetup, postTeacherRegistration } from "@/lib/auth/teacher-registration";
import { isTeacherByRoles } from "@/lib/auth/user-roles";

export function RegisterTeacherClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/ops/invite";

  const { user, authLoading, profileLoading, roles, profile } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const autoAttemptedRef = useRef(false);

  const isTeacher = useMemo(() => isTeacherByRoles(roles), [roles]);
  const isStudent = useMemo(() => roles.some((r) => r.toLowerCase() === "student"), [roles]);
  const needsSetup = useMemo(
    () => needsTeacherTenantSetup(roles, profile?.organizationId),
    [roles, profile?.organizationId],
  );

  const completeRegistration = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setBusy(true);
    setMessage("");
    try {
      const token = await user.getIdToken();
      const j = await postTeacherRegistration(token);
      if (!j.ok) {
        setMessage(j.message ?? "登録に失敗しました。");
        return false;
      }
      const q = new URLSearchParams();
      q.set("tenantCreated", "1");
      const sep = safeNext.includes("?") ? "&" : "?";
      router.replace(`${safeNext}${sep}${q.toString()}`);
      return true;
    } catch {
      setMessage("通信エラーが発生しました。");
      return false;
    } finally {
      setBusy(false);
    }
  }, [router, safeNext, user]);

  useEffect(() => {
    if (authLoading || profileLoading || !user || !needsSetup || busy) return;
    if (autoAttemptedRef.current) return;
    autoAttemptedRef.current = true;
    void completeRegistration().then((ok) => {
      if (!ok) autoAttemptedRef.current = false;
    });
  }, [authLoading, profileLoading, user, needsSetup, busy, completeRegistration]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    autoAttemptedRef.current = true;
    await completeRegistration();
  };

  if (authLoading || profileLoading) {
    return (
      <main className="page-surface page-surface--auth">
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  if (!user) {
    const signInHref = `/sign-in?next=${encodeURIComponent(`/register/teacher?next=${encodeURIComponent(safeNext)}`)}`;
    return (
      <main className="page-surface page-surface--auth">
        <h1>教員としてテナントを作成</h1>
        <p className="muted">続けるには Google でログインしてください。</p>
        <p>
          <Link href={signInHref}>ログインへ</Link>
        </p>
        <p className="muted" style={{ marginTop: 24 }}>
          <Link href="/tensaku-kakumei">トップへ戻る</Link>
        </p>
      </main>
    );
  }

  if (isStudent && !isTeacher) {
    return (
      <main className="page-surface page-surface--auth">
        <h1>教員としてテナントを作成</h1>
        <p className="error">
          このアカウントは生徒として登録されています。教員用に別の Google アカウントを使うか、管理者に依頼してください。
        </p>
        <p>
          <Link href="/tensaku-kakumei">トップへ戻る</Link>
        </p>
      </main>
    );
  }

  if (isTeacher) {
    return (
      <main className="page-surface page-surface--auth">
        <h1>教員としてテナントを作成</h1>
        <p className="muted">すでに教員として登録されています。</p>
        <p>
          <Link href={safeNext}>運用画面へ</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="page-surface page-surface--auth">
      <h1>教員としてテナントを作成</h1>
      <p className="student-page-lead">
        初回のみ、システムが<strong>テナント ID</strong>（organizationId）を自動で発行します。作成後、運用画面に表示される ID
        を控えてください（生徒招待リンクはそのテナントに紐づきます）。
      </p>

      {busy ? (
        <p className="muted" role="status">
          教員登録を完了しています…
        </p>
      ) : null}

      <form className="card" onSubmit={(ev) => void onSubmit(ev)}>
        <button type="submit" disabled={busy}>
          {busy ? "処理中…" : "テナントを作成して始める"}
        </button>
      </form>

      {message ? <p className="error">{message}</p> : null}

      <p className="muted" style={{ marginTop: 24 }}>
        <Link href="/tensaku-kakumei">トップへ戻る</Link>
      </p>
    </main>
  );
}
