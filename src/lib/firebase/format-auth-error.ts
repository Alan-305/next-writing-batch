import { FirebaseError } from "firebase/app";

/** よくあるコードは日本語で説明し、調査用に code を括弧で添える */
const FRIENDLY_BY_CODE: Record<string, string> = {
  "auth/popup-closed-by-user":
    "ログイン用のポップアップが閉じられたため、途中で止まりました。もう一度「Google でログイン」を押すか、下の「ポップアップを使わずログイン（リダイレクト）」をお試しください。",
  "auth/cancelled-popup-request":
    "別のログインが始まったか、ポップアップがキャンセルされました。少し待ってからもう一度お試しください。",
  "auth/popup-blocked":
    "ポップアップがブロックされています。アドレスバー付近でポップアップを許可するか、「ポップアップを使わずログイン（リダイレクト）」をご利用ください。",
  "auth/unauthorized-domain":
    "この URL のホストは Firebase の「承認済みドメイン」に含まれていません。Firebase Console の承認済みドメインに、いま開いているホスト（例: next-writing-batch-xxxxx.asia-northeast1.run.app など）を追加してください。",
};

/** Google OAuth が「The requested action is invalid」で返すときの共通ヒント（ポップアップ／リダイレクト両方で出うる） */
const INVALID_ACTION_HINT = [
  "Google 側でログインが拒否されています（ポップアップでもリダイレクトでも同じ原因のことが多いです）。次を確認してください。",
  "① Firebase Console → Authentication → 設定 → 承認済みドメインに、いまアドレスバーのホストがある。",
  "② Google Cloud → OAuth 同意画面が「テスト」のとき、ログインに使う Gmail を「テストユーザー」に追加している（未追加だとこの英文になりがちです）。",
  "③ Google Cloud → 認証情報 → OAuth 2.0 クライアント（Web）に、JavaScript 生成元（現在のオリジン）と、リダイレクト URI「https://（NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN の値）/__/auth/handler」がある。",
  "④ Firebase → Authentication → Sign-in method で Google が有効。",
].join("\n");

function messageLooksLikeInvalidAction(msg: string): boolean {
  return /requested action is invalid/i.test(msg);
}

/** handler.js の「Unable to verify…」や getProjectConfig 403 と同根のことが多い */
function messageLooksLikeUnauthorizedAppDomain(msg: string): boolean {
  return (
    /unable to verify that the app domain is authorized/i.test(msg) ||
    /getProjectConfig/i.test(msg) ||
    /app domain is authorized/i.test(msg)
  );
}

const DOMAIN_AND_API_KEY_HINT = [
  "Firebase が「このサイトのドメインを検証できない」と判断しています（開発者ツールに getProjectConfig 403 や Unable to verify… と出ることがあります）。次を順に確認してください。",
  "① Firebase Console → Authentication → 設定 → 承認済みドメインに、いまアドレスバーのホストを追加する。",
  "② Google Cloud Console → API とサービス → 認証情報 → このプロジェクトの「ブラウザ用」API キー（NEXT_PUBLIC_FIREBASE_API_KEY と同じキー）を開き、アプリケーションの制限が「HTTP リファラー（ウェブサイト）」なら、いまのオリジン（例: https://<host>/*）を追加する。",
  "③ .env.local の NEXT_PUBLIC_FIREBASE_* が、その Firebase プロジェクトの値と一致していること。",
].join("\n");

/** 画面表示用（Firebase の code を含める） */
export function formatFirebaseAuthError(e: unknown): string {
  if (e instanceof FirebaseError) {
    const friendly = FRIENDLY_BY_CODE[e.code];
    if (friendly) {
      return `${friendly}（${e.code}）`;
    }
    if (messageLooksLikeInvalidAction(e.message)) {
      return `${INVALID_ACTION_HINT}\n（Firebase: ${e.code}）`;
    }
    if (messageLooksLikeUnauthorizedAppDomain(e.message)) {
      return `${DOMAIN_AND_API_KEY_HINT}\n（Firebase: ${e.code}）`;
    }
    return `${e.code}: ${e.message}`;
  }
  if (e instanceof Error) {
    if (messageLooksLikeInvalidAction(e.message)) {
      return `${INVALID_ACTION_HINT}\n（原文: ${e.message}）`;
    }
    if (messageLooksLikeUnauthorizedAppDomain(e.message)) {
      return `${DOMAIN_AND_API_KEY_HINT}\n（原文: ${e.message}）`;
    }
    return e.message;
  }
  const s = String(e);
  if (messageLooksLikeInvalidAction(s)) {
    return `${INVALID_ACTION_HINT}\n（原文: ${s}）`;
  }
  if (messageLooksLikeUnauthorizedAppDomain(s)) {
    return `${DOMAIN_AND_API_KEY_HINT}\n（原文: ${s}）`;
  }
  return s;
}
