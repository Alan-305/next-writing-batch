import { NextResponse } from "next/server";

import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { listRegisteredTasks } from "@/lib/registered-tasks-list";

export const dynamic = "force-dynamic";

/** 招待リンク先の課題一覧（ログイン不要・org 指定） */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgRaw = (url.searchParams.get("org") ?? "").trim();
  const organizationId = sanitizeOrganizationIdForPath(orgRaw);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "org パラメータが必要です。" }, { status: 400 });
  }

  try {
    await migrateLegacyOrgLayoutOnce();
    const tasks = await listRegisteredTasks(organizationId);
    return NextResponse.json({ ok: true, organizationId, tasks });
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
