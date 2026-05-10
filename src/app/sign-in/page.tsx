"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import { shouldRedirectStudentToOnboarding } from "@/lib/student-profile-gate";
import { AUTH_REDIRECT_ERROR_KEY, AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { formatFirebaseAuthError } from "@/lib/firebase/format-auth-error";
import { readFirebaseWebConfig, useFirebaseEmulators } from "@/lib/firebase/config";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { resetRedirectResultCacheForNewFlow } from "@/lib/firebase/redirect-result-once";

function isPopupBlocked(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "auth/popup-blocked";
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const safeNext = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/hub";
  const inviteOrg = (params.get("org") ?? "").trim();
  /** 教員の既存テナント参加（URL の teacherOrg）。画面には特別な案内は出さない */
  const teacherOrg = (params.get("teacherOrg") ?? "").trim();
  const emulatorMode = useFirebaseEmulators();
  const { configured, user, authLoading, authRedirectHint, profile, profileLoading, roles } =
    useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [firebaseAuthDomain, setFirebaseAuthDomain] = useState<string>("");
  const [inviteApplying, setInviteApplying] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
    const cfg = readFirebaseWebConfig();
    setFirebaseAuthDomain(cfg?.authDomain ?? "");
  }, []);

  /** リダイレクト後に getRedirectResult が失敗したとき Provider が sessionStorage に残す */
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(AUTH_REDIRECT_ERROR_KEY);
      if (msg) {
        sessionStorage.removeItem(AUTH_REDIRECT_ERROR_KEY);
        setError(msg);
      }
    } catch {
      /* sessionStorage 不可 */
    }
  }, []);

  const startGoogleRedirect = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Firebase が初期化できません。環境変数を確認してください。");
      return;
    }
    resetRedirectResultCacheForNewFlow();
    sessionStorage.setItem(AUTH_REDIRECT_NEXT_KEY, safeNext);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithRedirect(auth, provider);
  }, [safeNext]);

  const redirectToOnboardingIfNeeded = useCallback(
    async (token: string) => {
      const pr = await fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } });
      const pj = (await pr.json()) as {
        needsStudentProfile?: boolean;
        isStudentProfileComplete?: boolean;
      };
      if (
        pr.ok &&
        pj.needsStudentProfile === true &&
        pj.isStudentProfileComplete === false
      ) {
        router.replace(`/onboarding?next=${encodeURIComponent(safeNext)}`);
        return true;
      }
      return false;
    },
    [router, safeNext],
  );

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
      const tokenJoin = await auth.currentUser?.getIdToken();
      if (tokenJoin) {
        if (teacherOrg) {
          const res = await fetch("/api/register/teacher", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenJoin}`,
            },
            body: JSON.stringify({ organizationId: teacherOrg }),
          });
          if (!res.ok) {
            const j = (await res.json()) as { message?: string };
            throw new Error(j?.message ?? "設定の適用に失敗しました。");
          }
        } else if (inviteOrg) {
          const res = await fetch("/api/invite/accept", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${tokenJoin}`,
            },
            body: JSON.stringify({ organizationId: inviteOrg }),
          });
          if (!res.ok) {
            const j = (await res.json()) as { message?: string };
            throw new Error(j?.message ?? "招待リンクの適用に失敗しました。");
          }
        }
      }
      const tokenAfter = await auth.currentUser?.getIdToken();
      if (tokenAfter && (await redirectToOnboardingIfNeeded(tokenAfter))) {
        return;
      }
      await new Promise<void>((resolve) => {
        queueMicrotask(() => requestAnimationFrame(() => resolve()));
      });
      router.replace(safeNext);
    } catch (e: unknown) {
      if (isPopupBlocked(e)) {
        if (emulatorMode) {
          setError("ポップアップがブロックされました。ブラウザ設定でポップアップを許可してください。");
          return;
        }
        try {
          await startGoogleRedirect();
          return;
        } catch (e2: unknown) {
          setError(formatFirebaseAuthError(e2));
        }
      } else if (e instanceof FirebaseError && e.code === "auth/popup-closed-by-user") {
        if (emulatorMode) {
          setError("ポップアップが閉じられました。閉じずにアカウント選択まで進めてください。");
          return;
        }
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
  }, [
    emulatorMode,
    inviteOrg,
    teacherOrg,
    redirectToOnboardingIfNeeded,
    router,
    safeNext,
    startGoogleRedirect,
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!user || (!inviteOrg && !teacherOrg)) {
      setInviteResult(null);
      setInviteApplying(false);
      return;
    }
    setInviteApplying(true);
    setInviteResult(null);
    (async () => {
      try {
        const token = await user.getIdToken();
        if (teacherOrg) {
          const res = await fetch("/api/register/teacher", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ organizationId: teacherOrg }),
          });
          const j = (await res.json()) as { ok?: boolean; changed?: boolean; message?: string; organizationId?: string };
          if (!cancelled) {
            if (!res.ok || !j?.ok) {
              setInviteResult(j?.message ?? "設定の適用に失敗しました。");
            } else {
              setInviteResult(j.changed ? "テナント設定を反映しました。" : "テナント設定を確認しました。");
            }
          }
        } else {
          const res = await fetch("/api/invite/accept", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ organizationId: inviteOrg }),
          });
          const j = (await res.json()) as { ok?: boolean; changed?: boolean; message?: string; organizationId?: string };
          if (!cancelled) {
            if (!res.ok || !j?.ok) {
              setInviteResult(j?.message ?? "招待リンクの適用に失敗しました。");
            } else {
              setInviteResult(
                j.changed
                  ? `招待リンクを適用しました（organizationId: ${j.organizationId ?? inviteOrg}）。`
                  : `招待リンクを確認しました（organizationId: ${j.organizationId ?? inviteOrg}）。`,
              );
              const onboarded = await redirectToOnboardingIfNeeded(token);
              if (onboarded) return;
            }
          }
        }
      } catch {
        if (!cancelled) setInviteResult(teacherOrg ? "設定の適用に失敗しました。" : "招待リンクの適用に失敗しました。");
      } finally {
        if (!cancelled) setInviteApplying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteOrg, teacherOrg, user, redirectToOnboardingIfNeeded]);

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
    const needOnboard = shouldRedirectStudentToOnboarding(roles, profile, profileLoading);
    return (
      <main>
        <div className="card">
          <p style={{ marginTop: 0 }}>すでにログインしています。</p>
          {needOnboard ? (
            <p className="warning" style={{ marginTop: 0 }}>
              生徒プロフィール（学籍番号・ニックネーム）の登録が必要です。{" "}
              <Link href={`/onboarding?next=${encodeURIComponent(safeNext)}`}>初回登録へ</Link>
            </p>
          ) : null}
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
          現在は安定性を優先して、<strong>ポップアップ方式を推奨</strong>しています。リダイレクト方式で戻り結果が
          空になる環境があるためです。
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
            {firebaseAuthDomain ? (
              <>
                <p className="muted" style={{ marginTop: 12, marginBottom: 8 }}>
                  次の値は、このアプリが Firebase SDK に渡している <code>authDomain</code> です（<code>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN</code>{" "}
                  未設定なら <code>{`{projectId}.firebaseapp.com`}</code> になります）。
                </p>
                <p style={{ marginTop: 0, marginBottom: 0 }}>
                  <code>{firebaseAuthDomain}</code>
                </p>
                <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Google Cloud → 認証情報 → OAuth 2.0 クライアント（Web）の <strong>承認済みリダイレクト URI</strong> は通常{" "}
                  <code>{`https://${firebaseAuthDomain}/__/auth/handler`}</code> です（この値がズレると、Google から戻っても{" "}
                  <code>getRedirectResult</code> が空になることがあります）。
                </p>
              </>
            ) : null}
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              Cloud Run 運用では、今のホスト（例: <code>...run.app</code> / 独自ドメイン）を Firebase
              の承認済みドメインへ追加してください。ローカル検証時のみ <code>localhost</code> や <code>127.0.0.1</code>{" "}
              を追加します（<code>localhost</code> と <code>127.0.0.1</code> は別ホスト扱いです）。
            </p>
            <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
              コンソールに <code>getProjectConfig</code> が <strong>403</strong> や{" "}
              <code>Unable to verify that the app domain is authorized</code> がある場合は、上記の承認済みドメインに加え、
              Google Cloud → 認証情報 → 使用中のブラウザ用 API キー（<code>NEXT_PUBLIC_FIREBASE_API_KEY</code> と同じ）で{" "}
              <strong>HTTP リファラー制限</strong>に、いまの <code>{origin || "（このページのオリジン）"}</code>{" "}
              を許可リストへ入れてください（例: <code>https://{origin ? new URL(origin).host : "your-host"}/*</code>）。
            </p>
          </div>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        {!teacherOrg && inviteOrg ? (
          <p className="muted" style={{ marginTop: 0 }}>
            生徒招待リンクからアクセスしています（organizationId: <code>{inviteOrg}</code>）
          </p>
        ) : null}
        {inviteApplying ? (
          <p className="muted">{teacherOrg ? "設定を適用中です…" : "招待リンクを適用中です…"}</p>
        ) : null}
        {inviteResult ? <p className={inviteResult.includes("失敗") ? "error" : "success"}>{inviteResult}</p> : null}
        {authRedirectHint ? <p className="error">{authRedirectHint}</p> : null}
        <p>
          <button
            type="button"
            disabled={busy}
            style={{ background: "#475569" }}
            onClick={() => void onGoogle()}
          >
            {busy ? "処理中…" : "Google でログイン（推奨）"}
          </button>
        </p>
        {emulatorMode ? null : (
          <p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setBusy(true);
                void startGoogleRedirect().catch((e: unknown) => {
                  setError(formatFirebaseAuthError(e));
                  setBusy(false);
                });
              }}
            >
              {busy ? "処理中…" : "同じタブでログイン（リダイレクトを試す）"}
            </button>
          </p>
        )}
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
