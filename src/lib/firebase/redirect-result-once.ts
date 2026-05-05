import { getRedirectResult, type Auth, type UserCredential } from "firebase/auth";

/** Strict Mode 二重マウントでも getRedirectResult を一度だけ呼ぶ */
let redirectResultPromise: Promise<UserCredential | null> | null = null;

const REDIRECT_RESULT_MAX_MS = 25_000;

/**
 * 一部環境で Promise が解決しないことがあるため、上限時間後は null で打ち切る。
 */
export function getRedirectResultOnce(auth: Auth): Promise<UserCredential | null> {
  if (!redirectResultPromise) {
    redirectResultPromise = new Promise<UserCredential | null>((resolve, reject) => {
      let settled = false;
      const timer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              if (settled) return;
              settled = true;
              console.warn(
                `[firebase] getRedirectResult が ${REDIRECT_RESULT_MAX_MS}ms 以内に完了しませんでした。`,
              );
              resolve(null);
            }, REDIRECT_RESULT_MAX_MS)
          : undefined;

      void getRedirectResult(auth)
        .then((cred) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          resolve(cred);
        })
        .catch((e: unknown) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          reject(e);
        });
    }).finally(() => {
      /** 同じタブで再度「リダイレクトでログイン」するとき、前回の null 解決を再利用しない */
      redirectResultPromise = null;
    });
  }
  return redirectResultPromise;
}
