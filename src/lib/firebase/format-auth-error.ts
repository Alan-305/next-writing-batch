import { FirebaseError } from "firebase/app";

/** 画面表示用（Firebase の code を含める） */
export function formatFirebaseAuthError(e: unknown): string {
  if (e instanceof FirebaseError) {
    return `${e.code}: ${e.message}`;
  }
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
}
