"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isTeacherByRoles } from "@/lib/auth/user-roles";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";
import { AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Props = Readonly<{ children: React.ReactNode }>;

function canAccessOpsArea(uid: string, roles: string[]): boolean {
  if (isAllowlistedAdminUid(uid)) return true;
  return isTeacherByRoles(roles);
}

/**
 * /ops 配下: 管理者 allowlist または Firestore の teacher / admin ロールのみ。
 * 生徒（student のみ）のアクセスを拒否する。
 */
export function RequireOpsAccess({ children }: Props) {
  const { configured, user, authLoading, roles, profileLoading } = useFirebaseAuthContext();
  const router = useRouter();
  const pathname = usePathname() || "/ops";
  const signInRedirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  let resolvedUser = user ?? null;
  try {
    resolvedUser = user ?? getFirebaseAuth()?.currentUser ?? null;
  } catch {
    resolvedUser = user;
  }

  useEffect(() => {
    if (!configured || authLoading) return;

    if (signInRedirectTimerRef.current) {
      clearTimeout(signInRedirectTimerRef.current);
      signInRedirectTimerRef.current = null;
    }

    const ok = user ?? getFirebaseAuth()?.currentUser ?? null;
    if (ok) return;

    const delayMs =
      typeof window !== "undefined" && sessionStorage.getItem(AUTH_REDIRECT_NEXT_KEY)
        ? 6_000
        : 2_000;

    signInRedirectTimerRef.current = setTimeout(() => {
      signInRedirectTimerRef.current = null;
      if (!getFirebaseAuth()?.currentUser) {
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
  }, [configured, user, authLoading, router, pathname]);

  if (!configured) {
    return (
      <main className="card" style={{ margin: 24 }}>
        <p style={{ marginTop: 0 }}>
          Firebase が未設定のためこの画面を開けません。<code>.env.local</code> を確認してください。
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

  if (profileLoading) {
    return <p className="muted" style={{ margin: 24 }}>権限を確認しています…</p>;
  }

  if (!canAccessOpsArea(resolvedUser.uid, roles)) {
    return (
      <main className="card" style={{ margin: 24, maxWidth: 560 }}>
        <h1 style={{ marginTop: 0 }}>このエリアは教員・運用向けです</h1>
        <p className="muted">
          いまのログインは<strong>生徒</strong>として登録されています。運用ハブ・提出一覧などは教員アカウントのみが利用できます。
        </p>
        <p style={{ marginBottom: 0 }}>
          <Link href="/submit">生徒の提出画面へ</Link>
          {" · "}
          <Link href="/hub">開発ハブ</Link>
        </p>
      </main>
    );
  }

  return <>{children}</>;
}
