"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

type Props = Readonly<{ children: React.ReactNode }>;

/** 管理者 allowlist（NEXT_PUBLIC_FIREBASE_ADMIN_UIDS）に含まれる uid のみ通す */
export function RequireAdmin({ children }: Props) {
  const { configured, user, authLoading } = useFirebaseAuthContext();
  const router = useRouter();
  const pathname = usePathname() || "/admin";

  useEffect(() => {
    if (!configured || authLoading) return;
    if (!user) {
      const next = encodeURIComponent(pathname);
      router.replace(`/sign-in?next=${next}`);
    }
  }, [configured, user, authLoading, router, pathname]);

  if (!configured) {
    return (
      <main className="card" style={{ margin: 24 }}>
        <p style={{ marginTop: 0 }}>
          Firebase が未設定のため管理画面を開けません。<code>.env.local</code> を確認してください。
        </p>
      </main>
    );
  }

  if (authLoading) {
    return <p className="muted" style={{ margin: 24 }}>認証を確認しています…</p>;
  }

  if (!user) {
    return <p className="muted" style={{ margin: 24 }}>ログイン画面へ移動します…</p>;
  }

  if (!isAllowlistedAdminUid(user.uid)) {
    return (
      <main className="card" style={{ margin: 24 }}>
        <h1 style={{ marginTop: 0 }}>アクセスできません</h1>
        <p className="muted">この URL は管理者のみが利用できます。</p>
      </main>
    );
  }

  return <>{children}</>;
}
