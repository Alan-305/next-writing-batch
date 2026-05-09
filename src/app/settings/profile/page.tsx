"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";

export default function SettingsProfilePage() {
  const { user, profile, profileLoading, roles, authLoading } = useFirebaseAuthContext();
  const [studentNumber, setStudentNumber] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErr, setFieldErr] = useState<Partial<Record<"studentNumber" | "nickname", string>>>({});

  const isTeacher = useMemo(() => isTeacherByRoles(roles), [roles]);

  useEffect(() => {
    setStudentNumber(profile?.studentNumber?.trim() ?? "");
    setNickname(profile?.nickname?.trim() ?? "");
  }, [profile?.studentNumber, profile?.nickname]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || saving) return;
    setSaving(true);
    setMessage("");
    setFieldErr({});
    try {
      const token = await user.getIdToken();
      const body = isTeacher ? { nickname } : { studentNumber, nickname };
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
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
      setMessage("保存しました。");
    } catch {
      setMessage("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  if (!user && !authLoading) {
    return (
      <main>
        <p>
          <Link href="/sign-in?next=/settings/profile">ログイン</Link> が必要です。
        </p>
      </main>
    );
  }

  if (authLoading || profileLoading) {
    return (
      <main>
        <p className="muted">読み込み中…</p>
      </main>
    );
  }

  return (
    <main>
      <h1>プロフィール</h1>
      <p className="muted">
        学籍番号・ニックネームの変更は、以降の提出や運用表示に反映されます。
        <Link href="/settings"> 設定トップへ戻る</Link>
      </p>

      <form className="card" onSubmit={(ev) => void onSubmit(ev)}>
        {isTeacher ? (
          <p className="muted" style={{ marginTop: 0 }}>
            教員アカウントは<strong>ニックネーム（表示名）</strong>のみ変更できます。
          </p>
        ) : (
          <label className="field">
            <span>学籍番号</span>
            <input
              value={studentNumber}
              onChange={(e) => setStudentNumber(e.target.value)}
              disabled={saving}
              autoComplete="off"
              maxLength={32}
            />
            {fieldErr.studentNumber ? <span className="error">{fieldErr.studentNumber}</span> : null}
          </label>
        )}
        <label className="field">
          <span>ニックネーム（表示名）</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={saving}
            autoComplete="nickname"
            maxLength={60}
          />
          {fieldErr.nickname ? <span className="error">{fieldErr.nickname}</span> : null}
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </form>

      {message ? (
        <p className={message.includes("失敗") ? "error" : "success"} style={{ marginTop: 12 }}>
          {message}
        </p>
      ) : null}

      <p style={{ marginTop: 24 }}>
        <Link href="/submit">提出画面へ</Link>
      </p>
    </main>
  );
}
