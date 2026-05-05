import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

import {
  firebaseEmulatorHost,
  readFirebaseWebConfig,
  useFirebaseEmulators,
} from "@/lib/firebase/config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let emulatorsConnected = false;

function getOrInitApp(): FirebaseApp {
  const cfg = readFirebaseWebConfig();
  if (!cfg) {
    throw new Error(
      "Firebase Web 設定が未設定です。NEXT_PUBLIC_FIREBASE_* を .env.local に設定してください。",
    );
  }
  if (app && app.options.projectId !== cfg.projectId) {
    app = null;
    auth = null;
    db = null;
    emulatorsConnected = false;
  }
  if (!app) {
    const apps = getApps();
    const match = apps.find((a) => a.options?.projectId === cfg.projectId);
    if (match) {
      app = match;
    } else if (apps.length === 0) {
      app = initializeApp(cfg);
    } else {
      // 以前は常に getApps()[0] を使っていた。throw すると getFirebaseFirestore が未捕捉で画面全体が落ちる。
      const got = apps.map((a) => String(a.options?.projectId ?? "?")).join(", ");
      console.warn(
        `[firebase] .env の projectId（${cfg.projectId}）と getApps() のアプリ（${got}）が一致しません。認証エラーや 403 が出る場合は、ブラウザのサイトデータを消すかシークレットで開き直してください。いったん先頭のアプリで続行します。`,
      );
      app = apps[0]!;
    }
  }
  return app;
}

/** ブラウザでのみ呼び出す。未設定時は null。初期化失敗時は null（例外は投げない）。次の呼び出しで再試行する。 */
export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  if (!readFirebaseWebConfig()) return null;
  if (!auth) {
    try {
      auth = getAuth(getOrInitApp());
      maybeConnectEmulators();
    } catch (e) {
      console.error("[getFirebaseAuth] Firebase Auth の初期化に失敗しました", e);
      auth = null;
      return null;
    }
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  if (typeof window === "undefined") return null;
  if (!readFirebaseWebConfig()) return null;
  if (!db) {
    try {
      db = getFirestore(getOrInitApp());
      maybeConnectEmulators();
    } catch (e) {
      console.error("[getFirebaseFirestore] Firestore の初期化に失敗しました", e);
      db = null;
      return null;
    }
  }
  return db;
}

function maybeConnectEmulators(): void {
  if (typeof window === "undefined" || emulatorsConnected) return;
  if (!useFirebaseEmulators()) return;
  try {
    const host = firebaseEmulatorHost();
    const authInst = auth ?? getAuth(getOrInitApp());
    const dbInst = db ?? getFirestore(getOrInitApp());
    connectAuthEmulator(authInst, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(dbInst, host, 8080);
  } catch (e) {
    console.warn(
      "[maybeConnectEmulators] エミュレータ接続に失敗しました。FIREBASE_AUTH_EMULATOR_HOST や Emulator の起動を確認してください。本番接続を続行します。",
      e,
    );
  } finally {
    emulatorsConnected = true;
  }
}
