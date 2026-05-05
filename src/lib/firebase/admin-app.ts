import { cert, applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import type { ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let app: App | undefined;

/**
 * Firebase Admin（API ルートでの ID トークン検証用）。
 * - Auth Emulator: `FIREBASE_AUTH_EMULATOR_HOST` を設定（例: 127.0.0.1:9099）。サービスアカウント不要。
 * - 実プロジェクト: `FIREBASE_SERVICE_ACCOUNT_JSON`（1 行 JSON）または `GOOGLE_APPLICATION_CREDENTIALS`。
 */
export function getFirebaseAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID が未設定です。");
  }

  const useEmulators = (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR ?? "").trim().toLowerCase() === "true";
  const publicEmulatorHost = (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
  if (useEmulators && !(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "").trim()) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `${publicEmulatorHost}:9099`;
  }
  const emulator = (process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "").trim();
  if (emulator) {
    app = initializeApp({ projectId });
    return app;
  }

  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (raw) {
    const parsed = JSON.parse(raw) as ServiceAccount;
    app = initializeApp({ credential: cert(parsed), projectId });
    return app;
  }

  app = initializeApp({ credential: applicationDefault(), projectId });
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
