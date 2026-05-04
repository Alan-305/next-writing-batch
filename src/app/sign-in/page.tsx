"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { formatFirebaseAuthError } from "@/lib/firebase/format-auth-error";
import { getFirebaseAuth } from "@/lib/firebase/client";

function isPopupBlocked(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "auth/popup-blocked";
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const safeNext = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/hub";
  const { configured, user, authLoading } = useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  const startGoogleRedirect = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Firebase が初期化できません。環境変数を確認してください。");
      return;
    }
    sessionStorage.setItem(AUTH_REDIRECT_NEXT_KEY, safeNext);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
  }, [safeNext]);

  const onGoogle = useCallback(async () => {
    setError(null);
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Firebase が初期化できません。環境変数を確認してください。");
      return;
    }
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.replace(safeNext);
    } catch (e: unknown) {
      if (isPopupBlocked(e)) {
        try {
          await startGoogleRedirect();
          return;
        } catch (e2: unknown) {
          setError(formatFirebaseAuthError(e2));
        }
      } else {
        setError(formatFirebaseAuthError(e));
      }
    } finally {
      setBusy(false);
    }
  }, [router, safeNext, startGoogleRedirect]);

  if (!configured) {
    return (
      <main>
        <div className="card">
          <p style={{ marginTop: 0 }}>
            Firebase の公開設定が未入力です。<code>.env.local</code> に <code>NEXT_PUBLIC_FIREBASE_*</code>{" "}
            を設定してください（検証用の Firebase プロジェクト ID は Console の値どおり）。
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            <Link href="/hub">ハブへ戻る</Link>
          </p>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main>
        <p className="muted">認証状態を読み込み中です…</p>
      </main>
    );
  }

  if (user) {
    return (
      <main>
        <div className="card">
          <p style={{ marginTop: 0 }}>すでにログインしています。</p>
          <p style={{ marginBottom: 0 }}>
            <Link href={safeNext}>続ける（{safeNext}）</Link> ・ <Link href="/hub">ハブ</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>ログイン</h1>
        <p className="muted">このアプリでは Google アカウントでのみログインできます。</p>
        <p className="muted" style={{ marginTop: 0 }}>
          ポップアップをブロックしているブラウザでは、自動的に<strong>同じタブで Google に移動する方式</strong>に切り替わります。手元でブロックを解除したい場合は、アドレスバー右のポップアップ許可も有効にしてください。
        </p>
        {origin ? (
          <div className="card" style={{ background: "#f1f5f9", marginBottom: 12 }}>
            <p style={{ marginTop: 0, marginBottom: 8 }}>
              <strong>接続チェック</strong>（Firebase の「承認済みドメイン」と一致させる）
            </p>
            <p className="muted" style={{ marginBottom: 8 }}>
              いまブラウザが使っている<strong>オリジン</strong>は次のとおりです。このホスト名が Firebase Console → Authentication →
              設定 → <strong>承認済みドメイン</strong>に<strong>そのまま</strong>入っている必要があります。
            </p>
            <p style={{ marginBottom: 0 }}>
              <code>{origin}</code>
            </p>
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              開発では <code>http://localhost:3000</code> で開くのが確実です（<code>127.0.0.1</code>・<code>0.0.0.0</code>・LAN
              の IP は別エントリとして追加が必要なことが多いです）。
            </p>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <p>
          <button type="button" disabled={busy} onClick={() => void onGoogle()}>
            {busy ? "処理中…" : "Google でログイン"}
          </button>
        </p>
        <p>
          <button
            type="button"
            disabled={busy}
            style={{ background: "#475569" }}
            onClick={() => {
              setError(null);
              setBusy(true);
              void startGoogleRedirect().catch((e: unknown) => {
                setError(formatFirebaseAuthError(e));
                setBusy(false);
              });
            }}
          >
            ポップアップを使わずログイン（リダイレクト）
          </button>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          <Link href="/hub">キャンセルしてハブへ</Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<main><p className="muted">読み込み中…</p></main>}>
      <SignInInner />
    </Suspense>
  );
}
