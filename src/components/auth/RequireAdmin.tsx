"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { isAllowlistedAdminUid, parseAdminUidAllowlist } from "@/lib/firebase/admin-allowlist";
import { AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { getFirebaseAuth } from "@/lib/firebase/client";

type Props = Readonly<{ children: React.ReactNode }>;

/** 管理者 allowlist（NEXT_PUBLIC_FIREBASE_ADMIN_UIDS）に含まれる uid のみ通す */
export function RequireAdmin({ children }: Props) {
  const { configured, user, authLoading } = useFirebaseAuthContext();
  const router = useRouter();
  const pathname = usePathname() || "/admin";
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
          Firebase が未設定のため管理画面を開けません。<code>.env.local</code> を確認してください。
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

  if (!isAllowlistedAdminUid(resolvedUser.uid)) {
    const allowCount = parseAdminUidAllowlist().size;
    return (
      <main className="card" style={{ margin: 24, maxWidth: 560 }}>
        <h1 style={{ marginTop: 0 }}>アクセスできません</h1>
        <p className="muted">この URL は管理者のみが利用できます。</p>
        <p style={{ marginTop: 16 }}>
          いま Google でログインしているアカウントの <strong>Firebase Auth の UID</strong>は次のとおりです。この文字列を{" "}
          <code>.env.local</code> の <code>NEXT_PUBLIC_FIREBASE_ADMIN_UIDS</code> に<strong>そのまま</strong>追加し、
          <code>npm run dev</code> を<strong>止めてから再起動</strong>してください（保存だけでは反映されません）。
        </p>
        <p style={{ marginTop: 8, marginBottom: 0 }}>
          <code style={{ fontSize: "0.95rem", wordBreak: "break-all" }}>{resolvedUser.uid}</code>
        </p>
        {allowCount === 0 ? (
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            参考: いまのビルドでは <code>NEXT_PUBLIC_FIREBASE_ADMIN_UIDS</code> が<strong>1件も読み込めていません</strong>
            （空）。変数名の打ち間違い・別ファイルを編集していないかも確認してください。
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 16, marginBottom: 0 }}>
            参考: allowlist は <strong>{allowCount}</strong> 件読み込めていますが、上記 UID と一致していません。Console の Authentication
            → Users の UIDと一字一句同じか確認してください。
          </p>
        )}
      </main>
    );
  }

  return <>{children}</>;
}
