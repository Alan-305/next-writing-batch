import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { deleteTaskProblemsMasterFile } from "@/lib/load-task-problems-master";
import { deleteTeacherProofreadingSetup } from "@/lib/teacher-proofreading-setup-store";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 登録課題をサーバーから削除する（`data/task-problems/` と `data/teacher-proofreading-setup/`）。
 * 提出済みデータ（submissions）は削除しない。
 */
export async function DELETE(request: Request) {
  const gate = await verifyBearerUid(request);
  if (!gate.ok) return gate.response;

  const u = new URL(request.url);
  const taskId = (u.searchParams.get("taskId") || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, message: "taskId が必要です。" }, { status: 400 });
  }
  const taskErr = validateTaskIdForStorage(taskId);
  if (taskErr) {
    return NextResponse.json({ ok: false, message: taskErr }, { status: 422 });
  }

  try {
    const removedTaskProblems = await deleteTaskProblemsMasterFile(taskId);
    const removedTeacherSetup = await deleteTeacherProofreadingSetup(taskId);

    if (!removedTaskProblems && !removedTeacherSetup) {
      return NextResponse.json(
        {
          ok: false,
          message: `課題ID「${taskId}」に対応するサーバー上のファイルは見つかりませんでした（すでに削除済みの可能性があります）。`,
        },
        { status: 404 },
      );
    }

    const parts: string[] = [];
    if (removedTaskProblems) parts.push("提出プルダウン用の課題マスタ");
    if (removedTeacherSetup) parts.push("課題・添削設定の保存 JSON");
    return NextResponse.json({
      ok: true,
      message: `削除しました: ${parts.join("、")}。既存の提出データはそのまま残ります。`,
      removed: { taskProblems: removedTaskProblems, teacherSetup: removedTeacherSetup },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
}
