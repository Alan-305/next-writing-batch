import { NextResponse } from "next/server";

import {
  executeAdminUserAccountDeletion,
  UserAccountDeletionError,
} from "@/lib/admin/delete-user-account";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { isAllowlistedAdminUid } from "@/lib/firebase/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  targetUid?: unknown;
  confirmTargetUid?: unknown;
};

function isFailedPreconditionIndex(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = "code" in e ? Number((e as { code?: number }).code) : NaN;
  const message = "message" in e ? String((e as { message?: string }).message ?? "") : "";
  // gRPC FAILED_PRECONDITION = 9; Firestore index 未作成時にリンクがメッセージに含まれることが多い
  return code === 9 || message.toLowerCase().includes("index") || message.includes("indexes");
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  if (!isAllowlistedAdminUid(auth.uid)) {
    return NextResponse.json({ ok: false, message: "管理者のみが利用できます。" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const targetUid = body.targetUid != null ? String(body.targetUid) : "";
  const confirmTargetUid = body.confirmTargetUid != null ? String(body.confirmTargetUid) : "";

  try {
    const result = await executeAdminUserAccountDeletion({
      actorUid: auth.uid,
      targetUid,
      confirmTargetUid,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof UserAccountDeletionError) {
      return NextResponse.json({ ok: false, message: e.message, code: e.code }, { status: 400 });
    }
    if (isFailedPreconditionIndex(e)) {
      return NextResponse.json(
        {
          ok: false,
          code: "FIRESTORE_PRECONDITION",
          message:
            "Firestore がクエリを拒否しました（インデックス未整備など）。コンソールのエラー詳細を確認するか、しばらく待ってから再試行してください。",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 503 },
      );
    }
    console.error("[user-account-delete]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
}
