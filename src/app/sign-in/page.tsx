"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

import { useFirebaseAuthContext } from "@/components/auth/FirebaseAuthProvider";
import {
  isTeacherEntryPath,
  needsTeacherTenantSetup,
  postTeacherRegistration,
  teacherRegisterPath,
} from "@/lib/auth/teacher-registration";
import { shouldRedirectStudentToOnboarding } from "@/lib/student-profile-gate";
import { AUTH_REDIRECT_ERROR_KEY, AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { formatFirebaseAuthError } from "@/lib/firebase/format-auth-error";
import { useFirebaseEmulators } from "@/lib/firebase/config";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { resetRedirectResultCacheForNewFlow } from "@/lib/firebase/redirect-result-once";
import { resolveSignInNextPath, signInPublicHomePath } from "@/lib/auth/sign-in-navigation";
import { shouldAvoidGoogleRedirectAuth } from "@/lib/auth/prefer-popup-auth";

function isPopupBlocked(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "auth/popup-blocked";
}

function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const nextRaw = (params.get("next") ?? "").trim();
  const [hostname, setHostname] = useState("");
  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);
  const publicHome = signInPublicHomePath(hostname || undefined);
  const safeNext = resolveSignInNextPath(nextRaw, hostname || undefined);
  const inviteOrg = (params.get("org") ?? "").trim();
  /** 教員の既存テナント参加（URL の teacherOrg）。画面には特別な案内は出さない */
  const teacherOrg = (params.get("teacherOrg") ?? "").trim();
  const avoidRedirectAuth = shouldAvoidGoogleRedirectAuth();
  const emulatorMode = useFirebaseEmulators();
  const { configured, user, authLoading, authRedirectHint, profile, profileLoading, roles } =
    useFirebaseAuthContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteApplying, setInviteApplying] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

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

  /** 運用（/ops）向けログイン後、教員テナント未作成なら API で自動登録 */
  const ensureTeacherSetupForOpsNext = useCallback(
    async (token: string): Promise<boolean> => {
      if (teacherOrg || inviteOrg) return true;
      if (!isTeacherEntryPath(safeNext)) return true;
      const pr = await fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } });
      const pj = (await pr.json()) as { roles?: string[]; organizationId?: string | null };
      if (!pr.ok) return false;
      if (!needsTeacherTenantSetup(pj.roles ?? [], pj.organizationId)) return true;
      const reg = await postTeacherRegistration(token);
      if (reg.ok) return true;
      setError(reg.message ?? "教員登録に失敗しました。");
      router.replace(teacherRegisterPath(safeNext));
      return false;
    },
    [inviteOrg, router, safeNext, teacherOrg],
  );

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
      if (tokenAfter && !(await ensureTeacherSetupForOpsNext(tokenAfter))) {
        return;
      }
      if (tokenAfter && (await redirectToOnboardingIfNeeded(tokenAfter))) {
        return;
      }
      await new Promise<void>((resolve) => {
        queueMicrotask(() => requestAnimationFrame(() => resolve()));
      });
      router.replace(safeNext);
    } catch (e: unknown) {
      if (isPopupBlocked(e)) {
        if (emulatorMode || avoidRedirectAuth) {
          setError(
            avoidRedirectAuth
              ? "ポップアップがブロックされました。Safari の設定でポップアップを許可し、「Google でログイン（推奨）」をもう一度押してください。"
              : "ポップアップがブロックされました。ブラウザ設定でポップアップを許可してください。",
          );
          return;
        }
        try {
          await startGoogleRedirect();
          return;
        } catch (e2: unknown) {
          setError(formatFirebaseAuthError(e2));
        }
      } else if (e instanceof FirebaseError && e.code === "auth/popup-closed-by-user") {
        if (emulatorMode || avoidRedirectAuth) {
          setError(
            avoidRedirectAuth
              ? "ログイン画面が閉じられました。「Google でログイン（推奨）」をもう一度押し、ポップアップを閉じずに完了してください。"
              : "ポップアップが閉じられました。閉じずにアカウント選択まで進めてください。",
          );
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
    ensureTeacherSetupForOpsNext,
    redirectToOnboardingIfNeeded,
    router,
    safeNext,
    startGoogleRedirect,
    avoidRedirectAuth,
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

  useEffect(() => {
    if (!user || authLoading || profileLoading || teacherOrg || inviteOrg) return;
    if (safeNext.startsWith("/register/teacher")) {
      router.replace(safeNext);
      return;
    }
    if (needsTeacherTenantSetup(roles, profile?.organizationId) && isTeacherEntryPath(safeNext)) {
      router.replace(teacherRegisterPath(safeNext));
    }
  }, [user, authLoading, profileLoading, safeNext, roles, profile, teacherOrg, inviteOrg, router]);

  if (!configured) {
    return (
      <main className="page-surface page-surface--auth">
        <div className="card page-surface-card">
          <p style={{ marginTop: 0 }}>
            Firebase の公開設定が未入力です。<code>.env.local</code> に <code>NEXT_PUBLIC_FIREBASE_*</code>{" "}
            を設定してください（検証用の Firebase プロジェクト ID は Console の値どおり）。
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>
            <Link href="/tensaku-kakumei">トップへ戻る</Link>
          </p>
        </div>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="page-surface page-surface--auth">
        <p className="muted">認証状態を読み込み中です…</p>
      </main>
    );
  }

  if (user) {
    if (
      safeNext.startsWith("/register/teacher") ||
      (needsTeacherTenantSetup(roles, profile?.organizationId) &&
        isTeacherEntryPath(safeNext) &&
        !teacherOrg &&
        !inviteOrg)
    ) {
      return (
        <main className="page-surface page-surface--auth">
          <p className="muted">教員登録へ移動しています…</p>
        </main>
      );
    }
    const needOnboard = shouldRedirectStudentToOnboarding(roles, profile, profileLoading);
    return (
      <main className="page-surface page-surface--auth">
        <div className="card">
          <p style={{ marginTop: 0 }}>すでにログインしています。</p>
          {needOnboard ? (
            <p className="warning" style={{ marginTop: 0 }}>
              生徒プロフィール（学籍番号・ニックネーム）の登録が必要です。{" "}
              <Link href={`/onboarding?next=${encodeURIComponent(safeNext)}`}>初回登録へ</Link>
            </p>
          ) : null}
          <p style={{ marginBottom: 0 }}>
            <Link href={safeNext}>続ける（{safeNext}）</Link>
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
        {emulatorMode || avoidRedirectAuth ? null : (
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
        {avoidRedirectAuth ? (
          <p className="muted" style={{ marginBottom: 0, lineHeight: 1.6 }}>
            Safari / iPhone では「Google でログイン（推奨）」の<strong>ポップアップ方式</strong>
            をお使いください。リダイレクト方式はログイン結果を受け取れないことがあります。
          </p>
        ) : null}
        <p className="muted" style={{ marginBottom: 0 }}>
          <Link href={publicHome}>キャンセルして戻る</Link>
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
