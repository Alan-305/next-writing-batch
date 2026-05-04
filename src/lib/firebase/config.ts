export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim() &&
      (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim() &&
      (process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "").trim(),
  );
}

export function readFirebaseWebConfig(): FirebaseWebConfig | null {
  if (!isFirebaseClientConfigured()) return null;
  const apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim();
  const projectId = (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim();
  const appId = (process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "").trim();
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
