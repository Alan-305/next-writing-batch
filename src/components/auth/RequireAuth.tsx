"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
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
  const signInRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const auth = getFirebaseAuth();
  const resolvedUser = user ?? auth?.currentUser ?? null;

  useEffect(() => {
    if (!configured || authLoading) return;

    if (signInRedirectTimerRef.current) {
      clearTimeout(signInRedirectTimerRef.current);
      signInRedirectTimerRef.current = null;
    }

    const a = getFirebaseAuth();
    const ok = user ?? a?.currentUser ?? null;
    if (ok) return;

    /** Google リダイレクト戻り直後は sessionStorage に残る。getRedirectResult / setUser 確定まで待つ。 */
    const delayMs =
      typeof window !== "undefined" && sessionStorage.getItem(AUTH_REDIRECT_NEXT_KEY)
        ? 6_000
        : 2_000;

    signInRedirectTimerRef.current = setTimeout(() => {
      signInRedirectTimerRef.current = null;
      const stillNoUser = !getFirebaseAuth()?.currentUser;
      if (stillNoUser) {
        const next = encodeURIComponent(pathname);
        router.replace(`/sign-in?next=${next}`);
      }
    }, delayMs);

    return () => {
      if (signInRedirectTimerRef.current) {
        clearTimeout(signInRedirectTimerRef.current);
        signInRedirectTimerRef.current = null;
      }
    };
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
