import { NextResponse } from "next/server";

import { getAdminAuth } from "@/lib/firebase/admin-app";

export type VerifyBearerResult =
  | { ok: true; uid: string }
  | { ok: false; response: NextResponse };

/**
 * Authorization: Bearer &lt;Firebase ID token&gt; を検証し、uid を返す。
 */
export async function verifyBearerUid(request: Request): Promise<VerifyBearerResult> {
  const h = request.headers.get("authorization")?.trim() ?? "";
  const m = /^Bearer\s+(\S+)/i.exec(h);
  if (!m?.[1]) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "UNAUTHORIZED",
          message: "ログインが必要です。ページを再読み込みするか、再ログインしてください。",
        },
        { status: 401 },
      ),
    };
  }

  let auth;
  try {
    auth = getAdminAuth();
  } catch (e) {
    console.error("[verifyBearerUid] Firebase Admin の初期化に失敗しました", e);
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "AUTH_CONFIG",
          message:
            "サーバー側の Firebase Admin 設定が不足しています。FIREBASE_SERVICE_ACCOUNT_JSON または GOOGLE_APPLICATION_CREDENTIALS、または Auth Emulator 用の FIREBASE_AUTH_EMULATOR_HOST を確認してください。",
        },
        { status: 503 },
      ),
    };
  }

  try {
    const decoded = await auth.verifyIdToken(m[1]);
    return { ok: true, uid: decoded.uid };
  } catch (e) {
    console.warn("[verifyBearerUid] verifyIdToken failed", e);
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          code: "UNAUTHORIZED",
          message: "ID トークンが無効です。再ログインしてから再度お試しください。",
        },
        { status: 401 },
      ),
    };
  }
}
