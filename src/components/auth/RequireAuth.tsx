"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";

type Props = Readonly<{ children: React.ReactNode }>;

/**
 * 解答・入力作業など、Google 認証が必要なルート用。
 * 未ログイン時は /sign-in へ（戻り先 next に現在パスを付与）。
 */
export function RequireAuth({ children }: Props) {
  const { configured, user, authLoading } = useFirebaseAuthContext();
  const router = useRouter();
  const pathname = usePathname() || "/";

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
          Firebase が未設定です。<code>.env.local</code> に検証用の{" "}
          <code>NEXT_PUBLIC_FIREBASE_*</code> を設定し、開発サーバーを再起動してください。
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

  return <>{children}</>;
}
