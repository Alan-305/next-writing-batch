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
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(cfg);
  }
  return app;
}

/** ブラウザでのみ呼び出す。未設定時は null。 */
export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;
  if (!readFirebaseWebConfig()) return null;
  if (!auth) {
    auth = getAuth(getOrInitApp());
    maybeConnectEmulators();
  }
  return auth;
}

export function getFirebaseFirestore(): Firestore | null {
  if (typeof window === "undefined") return null;
  if (!readFirebaseWebConfig()) return null;
  if (!db) {
    db = getFirestore(getOrInitApp());
    maybeConnectEmulators();
  }
  return db;
}

function maybeConnectEmulators(): void {
  if (typeof window === "undefined" || emulatorsConnected) return;
  if (!useFirebaseEmulators()) return;
  const host = firebaseEmulatorHost();
  const authInst = auth ?? getAuth(getOrInitApp());
  const dbInst = db ?? getFirestore(getOrInitApp());
  connectAuthEmulator(authInst, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(dbInst, host, 8080);
  emulatorsConnected = true;
}
