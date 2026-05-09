"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";
import { shouldRedirectStudentToOnboarding } from "@/lib/student-profile-gate";

export function OnboardingClient() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/submit";

  const { user, profile, profileLoading, roles, authLoading, signOutUser } = useFirebaseAuthContext();
  const [studentNumber, setStudentNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErr, setFieldErr] = useState<Partial<Record<"studentNumber" | "nickname", string>>>({});

  const isTeacher = useMemo(() => isTeacherByRoles(roles), [roles]);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(`/onboarding?next=${encodeURIComponent(safeNext)}`)}`);
      return;
    }
    if (isTeacher) {
      router.replace(safeNext);
    }
  }, [authLoading, profileLoading, user, isTeacher, router, safeNext]);

  useEffect(() => {
    if (!profile?.studentNumber && !profile?.nickname) return;
    setStudentNumber(profile.studentNumber?.trim() ?? "");
    setNickname(profile.nickname?.trim() ?? "");
  }, [profile?.studentNumber, profile?.nickname]);

  useEffect(() => {
    if (authLoading || profileLoading || !user || isTeacher) return;
    if (!shouldRedirectStudentToOnboarding(roles, profile, profileLoading)) {
      router.replace(safeNext);
    }
  }, [authLoading, profileLoading, user, roles, profile, isTeacher, router, safeNext]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setMessage("");
    setFieldErr({});
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentNumber, nickname }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        message?: string;
        fields?: Partial<Record<"studentNumber" | "nickname", string>>;
      };
      if (!res.ok || !j.ok) {
        setMessage(j.message ?? "保存に失敗しました。");
        if (j.fields) setFieldErr(j.fields);
        return;
      }
      router.replace(safeNext);
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || profileLoading || !user || isTeacher) {
    return (
      <main>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  return (
    <main>
      <h1>初回プロフィール登録</h1>
      <p className="student-page-lead">
        教員からの招待で学校に参加したあと、<strong>学籍番号</strong>と<strong>ニックネーム（表示名）</strong>
        を登録してください。提出フォームに毎回入力する必要はありません。
      </p>

      <form className="card" onSubmit={(ev) => void onSubmit(ev)}>
        <label className="field">
          <span>学籍番号</span>
          <input
            value={studentNumber}
            onChange={(e) => setStudentNumber(e.target.value)}
            placeholder="例: A1023（半角英数字・._-）"
            disabled={saving}
            autoComplete="off"
            maxLength={32}
          />
          {fieldErr.studentNumber ? <span className="error">{fieldErr.studentNumber}</span> : null}
        </label>
        <label className="field">
          <span>ニックネーム（表示名）</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例: 山田（運用画面・結果表示に使います）"
            disabled={saving}
            autoComplete="nickname"
            maxLength={60}
          />
          {fieldErr.nickname ? <span className="error">{fieldErr.nickname}</span> : null}
        </label>
        <p className="muted" style={{ fontSize: "0.9em", marginTop: 0 }}>
          英文の解答欄には、学籍番号や本名を書かないでください。
        </p>
        <button type="submit" disabled={saving}>
          {saving ? "保存中…" : "登録して続ける"}
        </button>
      </form>

      {message ? <p className="error">{message}</p> : null}

      <p className="muted" style={{ marginTop: 24 }}>
        <button
          type="button"
          className="muted"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onClick={() => void signOutUser()}
        >
          ログアウト
        </button>
      </p>
    </main>
  );
}
