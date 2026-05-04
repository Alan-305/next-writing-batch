"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Props = Readonly<{ children: React.ReactNode }>;

/**
 * 解答・入力作業など、Google 認証が必要なルート用。
 * 未ログイン時は /sign-in へ（戻り先 next に現在パスを付与）。
 *
 * Firebase の currentUser は onAuthStateChanged より先に更新されることがあるため、
 * ログイン直後の router.replace と競合しても弾かれないよう currentUser をフォールバックに使う。
 */
export function RequireAuth({ children }: Props) {
  const { configured, user, authLoading } = useFirebaseAuthContext();
  const router = useRouter();
  const pathname = usePathname() || "/";

  const auth = getFirebaseAuth();
  const resolvedUser = user ?? auth?.currentUser ?? null;

  useEffect(() => {
    if (!configured || authLoading) return;
    const a = getFirebaseAuth();
    const ok = user ?? a?.currentUser ?? null;
    if (!ok) {
      const next = encodeURIComponent(pathname);
      router.replace(`/sign-in?next=${next}`);
    }
  }, [configured, authLoading, user, router, pathname]);

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

  if (!resolvedUser) {
    return <p className="muted" style={{ margin: 24 }}>ログイン画面へ移動します…</p>;
  }

  return <>{children}</>;
}
