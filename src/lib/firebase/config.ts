export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const CLIENT_WEB_CFG_UNSET = Symbol("clientFirebaseWebConfigUnset");
let clientWebConfigFromServer: FirebaseWebConfig | null | typeof CLIENT_WEB_CFG_UNSET = CLIENT_WEB_CFG_UNSET;

/**
 * ルート layout（サーバー）が読んだ設定をクライアントで使う。
 * NEXT_PUBLIC_* のクライアントバンドルへのインラインが欠けるケース（古い .next、未再起動の dev 等）のフォールバック。
 * null を渡したときはシードを解除し、クライアントは process.env（バンドルインライン）のみを見る。
 */
export function seedClientFirebaseWebConfig(cfg: FirebaseWebConfig | null): void {
  if (typeof window === "undefined") return;
  if (cfg === null) {
    clientWebConfigFromServer = CLIENT_WEB_CFG_UNSET;
    return;
  }
  clientWebConfigFromServer = cfg;
}

export function isFirebaseClientConfigured(): boolean {
  return readFirebaseWebConfig() !== null;
}

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  if (typeof window !== "undefined" && clientWebConfigFromServer !== CLIENT_WEB_CFG_UNSET) {
    return clientWebConfigFromServer;
  }
  const apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim();
  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
  const appId = (process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "").trim();
  if (!apiKey || !projectId || !appId) return null;
  const authDomain = (process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "").trim() || `${projectId}.firebaseapp.com`;
  const storageBucket = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "").trim() || `${projectId}.appspot.com`;
  const messagingSenderId = (process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "").trim() || "0";
  const measurementId = (process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "").trim() || undefined;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
  };
}

export function useFirebaseEmulators(): boolean {
  return (process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR ?? "").trim().toLowerCase() === "true";
}

export function firebaseEmulatorHost(): string {
  return (process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST ?? "127.0.0.1").trim() || "127.0.0.1";
}
