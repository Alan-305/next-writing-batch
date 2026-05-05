"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";

import { PRODUCT_ID_NEXT_WRITING_BATCH } from "@/lib/constants/nexus-products";
import { isFirebaseClientConfigured } from "@/lib/firebase/config";
import { AUTH_REDIRECT_ERROR_KEY, AUTH_REDIRECT_NEXT_KEY } from "@/lib/firebase/auth-redirect";
import { formatFirebaseAuthError } from "@/lib/firebase/format-auth-error";
import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase/client";
import { getRedirectResultOnce } from "@/lib/firebase/redirect-result-once";
import { userEntitlementRef, userProfileRef } from "@/lib/firebase/firestore-paths";
import type { EntitlementDoc, FirestoreUserProfile } from "@/lib/firebase/types";

export type FirebaseAuthContextValue = {
  configured: boolean;
  user: User | null;
  authLoading: boolean;
  /** Google リダイレクト戻りで getRedirectResult が空だったときのヒント（画面表示用） */
  authRedirectHint: string | null;
  /** Firestore users/{uid}（未作成時は null） */
  profile: FirestoreUserProfile | null;
  profileLoading: boolean;
  /** 本アプリ用 entitlements（未作成時は null → 画面では none 相当として扱える） */
  entitlement: EntitlementDoc | null;
  entitlementLoading: boolean;
  /** roles はプロファイルまたは空配列 */
  roles: string[];
  signOutUser: () => Promise<void>;
};

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

export function useFirebaseAuthContext(): FirebaseAuthContextValue {
  const v = useContext(FirebaseAuthContext);
  if (!v) {
    throw new Error("useFirebaseAuthContext は FirebaseAuthProvider 内で使ってください。");
  }
  return v;
}

export function FirebaseAuthProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const configured = useMemo(() => isFirebaseClientConfigured(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(configured);
  const [authRedirectHint, setAuthRedirectHint] = useState<string | null>(null);
  const [profile, setProfile] = useState<FirestoreUserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [entitlement, setEntitlement] = useState<EntitlementDoc | null>(null);
  const [entitlementLoading, setEntitlementLoading] = useState(false);

  useEffect(() => {
    if (!configured) {
      setAuthLoading(false);
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);

    let cancelled = false;
    let unsub: (() => void) | null = null;

    const REDIRECT_EMPTY_HINT = [
      "Google から戻りましたが、ログイン結果を Firebase が受け取れませんでした（エラーは出ていないことがあります）。",
      "① 必ず http://localhost:3000 で開き、npm run dev:localhost を使う。",
      "② Firebase Console → Authentication → 承認済みドメイン に localhost がある。",
      "③ Google Cloud のブラウザ API キーに http://localhost:3000/* と https://（projectId）.firebaseapp.com/* がある。",
      "④ OAuth 同意画面が「テスト」のとき、使う Gmail をテストユーザーに追加している。",
      "⑤ 同じタブでもう一度「Google でログイン」を試す（キャッシュ修正済み）。",
    ].join("\n");

    void (async () => {
      try {
        const result = await getRedirectResultOnce(auth);
        if (cancelled) return;

        if (result?.user) {
          setAuthRedirectHint(null);
          setUser(result.user);
          const stored = sessionStorage.getItem(AUTH_REDIRECT_NEXT_KEY);
          const next =
            stored && stored.startsWith("/") && !stored.startsWith("//") ? stored : "/hub";
          queueMicrotask(() => {
            requestAnimationFrame(() => {
              sessionStorage.removeItem(AUTH_REDIRECT_NEXT_KEY);
              router.replace(next);
            });
          });
        } else if (typeof window !== "undefined" && sessionStorage.getItem(AUTH_REDIRECT_NEXT_KEY)) {
          sessionStorage.removeItem(AUTH_REDIRECT_NEXT_KEY);
          try {
            sessionStorage.setItem(AUTH_REDIRECT_ERROR_KEY, REDIRECT_EMPTY_HINT);
          } catch {
            /* sessionStorage 不可 */
          }
          setAuthRedirectHint(REDIRECT_EMPTY_HINT);
        }
      } catch (e) {
        if (cancelled) return;
        try {
          sessionStorage.setItem(AUTH_REDIRECT_ERROR_KEY, formatFirebaseAuthError(e));
        } catch {
          /* sessionStorage 不可 */
        }
        setAuthRedirectHint(formatFirebaseAuthError(e));
        console.error("[FirebaseAuthProvider] getRedirectResult に失敗しました", e);
      } finally {
        if (cancelled) return;
        unsub = onAuthStateChanged(auth, (next) => {
          setUser(next);
          if (next) setAuthRedirectHint(null);
          setAuthLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [configured, router]);

  useEffect(() => {
    if (!configured || !user) {
      setProfile(null);
      setEntitlement(null);
      setProfileLoading(false);
      setEntitlementLoading(false);
      return;
    }
    const db = getFirebaseFirestore();
    if (!db) {
      setProfileLoading(false);
      setEntitlementLoading(false);
      return;
    }

    setProfileLoading(true);
    setEntitlementLoading(true);

    const userRef = userProfileRef(db, user.uid);
    const entRef = userEntitlementRef(db, user.uid, PRODUCT_ID_NEXT_WRITING_BATCH);

    const unsubProfile = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) {
          setProfile(null);
        } else {
          const data = snap.data() as FirestoreUserProfile;
          setProfile({
            roles: Array.isArray(data.roles) ? data.roles.filter((r) => typeof r === "string") : [],
            organizationId:
              data.organizationId === undefined || data.organizationId === null
                ? null
                : String(data.organizationId),
          });
        }
        setProfileLoading(false);
      },
      () => {
        setProfile(null);
        setProfileLoading(false);
      },
    );

    const unsubEnt = onSnapshot(
      entRef,
      (snap) => {
        if (!snap.exists()) {
          setEntitlement(null);
        } else {
          const data = snap.data() as Partial<EntitlementDoc>;
          const status = data.status === "active" ? "active" : "none";
          setEntitlement({
            status,
            source: data.source ?? null,
            expiresAt: data.expiresAt ?? null,
            organizationId: data.organizationId ?? null,
          });
        }
        setEntitlementLoading(false);
      },
      () => {
        setEntitlement(null);
        setEntitlementLoading(false);
      },
    );

    return () => {
      unsubProfile();
      unsubEnt();
    };
  }, [configured, user]);

  const signOutUser = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const roles = profile?.roles ?? [];

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      configured,
      user,
      authLoading,
      authRedirectHint,
      profile,
      profileLoading,
      entitlement,
      entitlementLoading,
      roles,
      signOutUser,
    }),
    [
      configured,
      user,
      authLoading,
      authRedirectHint,
      profile,
      profileLoading,
      entitlement,
      entitlementLoading,
      roles,
      signOutUser,
    ],
  );

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}
