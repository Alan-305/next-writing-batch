import { NextResponse } from "next/server";

import { listRegisteredTasks } from "@/lib/registered-tasks-list";

export const dynamic = "force-dynamic";

/** 登録済み課題（`data/task-problems/*.json`）— 生徒提出・照会のプルダウン用 */
export async function GET() {
  try {
    const tasks = await listRegisteredTasks();
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
