import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { listRegisteredTasks } from "@/lib/registered-tasks-list";

export const dynamic = "force-dynamic";

/** 登録済み課題（テナント配下）— ログイン中ユーザーの組織のみ */
export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  try {
    await migrateLegacyOrgLayoutOnce();
    const tasks = await listRegisteredTasks(auth.organizationId);
    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "課題一覧の取得に失敗しました。",
        tasks: [],
      },
      { status: 500 },
    );
  }
}
