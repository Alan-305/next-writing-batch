"use client";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Variant = "student" | "teacher";

type Props = Readonly<{ variant: Variant }>;

/** ヘッダー内にログイン中ユーザーの簡易表示とログアウトを出す（認証済みルート向け） */
export function AuthToolbar({ variant }: Props) {
  const { configured, user, authLoading, profile, profileLoading, signOutUser } = useFirebaseAuthContext();

  if (!configured) return null;
  if (authLoading) {
    return (
      <span className="muted" style={{ fontSize: 13 }}>
        認証…
      </span>
    );
  }
  if (!user) return null;

  const muted = variant === "student";
  const orgId = String(profile?.organizationId ?? "").trim();

  return (
    <div className={variant === "student" ? "auth-toolbar auth-toolbar--student" : "auth-toolbar auth-toolbar--teacher"}>
      <div className="auth-toolbar-user-block">
        <span className={`auth-toolbar-email${muted ? " muted" : ""}`} title={user.email ?? ""}>
          {user.email ?? user.uid}
        </span>
        {variant === "teacher" ? (
          profileLoading ? (
            <span className="muted auth-toolbar-meta">テナント ID を読み込み中…</span>
          ) : orgId ? (
            <span className="muted auth-toolbar-tenant-id auth-toolbar-meta" title={`organizationId: ${orgId}`}>
              テナント ID: <code>{orgId}</code>
            </span>
          ) : null
        ) : null}
      </div>
      <button type="button" onClick={() => void signOutUser()}>
        ログアウト
      </button>
    </div>
  );
}
