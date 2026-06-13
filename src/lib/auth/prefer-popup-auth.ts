/** iOS / Safari では signInWithRedirect の getRedirectResult が空になりやすい */
export function shouldAvoidGoogleRedirectAuth(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|OPR\//i.test(ua);
  return isIOS || isSafari;
}
