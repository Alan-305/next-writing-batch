import { getRedirectResult, type Auth, type UserCredential } from "firebase/auth";

const REDIRECT_RESULT_MAX_MS = 25_000;

/**
 * このタブでの getRedirectResult の解決済み値。
 * undefined = 未解決。null / UserCredential = 解決済み（二重呼び出しで Firebase が空を返すのを防ぐ）
 */
let resolvedRedirectSnapshot: UserCredential | null | undefined = undefined;
let redirectResultInFlight: Promise<UserCredential | null> | null = null;

/**
 * 新しい signInWithRedirect を始める直前に呼ぶ。
 * 前回のキャッシュを消し、戻ってきた直後の再マウントでも結果を取り直せるようにする。
 */
export function resetRedirectResultCacheForNewFlow(): void {
  resolvedRedirectSnapshot = undefined;
  redirectResultInFlight = null;
}

/**
 * Strict Mode の二重マウントでも getRedirectResult は実質一度だけ。
 * 解決後はスナップショットを返し、Firebase 側の「既に消費済み」による空結果を避ける。
 */
export function getRedirectResultOnce(auth: Auth): Promise<UserCredential | null> {
  if (resolvedRedirectSnapshot !== undefined) {
    return Promise.resolve(resolvedRedirectSnapshot);
  }
  if (!redirectResultInFlight) {
    redirectResultInFlight = new Promise<UserCredential | null>((resolve, reject) => {
      let settled = false;
      const timer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              if (settled) return;
              settled = true;
              console.warn(
                `[firebase] getRedirectResult が ${REDIRECT_RESULT_MAX_MS}ms 以内に完了しませんでした。`,
              );
              resolvedRedirectSnapshot = null;
              resolve(null);
            }, REDIRECT_RESULT_MAX_MS)
          : undefined;

      void getRedirectResult(auth)
        .then((cred) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          resolvedRedirectSnapshot = cred;
          resolve(cred);
        })
        .catch((e: unknown) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) window.clearTimeout(timer);
          reject(e);
        });
    }).finally(() => {
      redirectResultInFlight = null;
    });
  }
  return redirectResultInFlight;
}
