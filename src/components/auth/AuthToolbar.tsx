"use client";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Variant = "student" | "teacher";

type Props = Readonly<{ variant: Variant }>;

/** ヘッダー内にログイン中ユーザーの簡易表示とログアウトを出す（認証済みルート向け） */
export function AuthToolbar({ variant }: Props) {
  const { configured, user, authLoading, signOutUser } = useFirebaseAuthContext();

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
  return (
    <div
      style={{
        marginLeft: "auto",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      <span className={muted ? "muted" : undefined} style={{ fontSize: 13, maxWidth: 220 }} title={user.email ?? ""}>
        {user.email ?? user.uid}
      </span>
      <button type="button" onClick={() => void signOutUser()}>
        ログアウト
      </button>
    </div>
  );
}
