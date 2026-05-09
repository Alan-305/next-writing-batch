import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { deleteTaskProblemsMasterFile } from "@/lib/load-task-problems-master";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { deleteTaskProblemsMasterFromFirestore } from "@/lib/task-problems-firestore";
import { deleteTeacherProofreadingSetup } from "@/lib/teacher-proofreading-setup-store";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 登録課題をサーバーから削除する（テナント配下の課題マスタと教員設定）。
 * 提出済みデータ（submissions）は削除しない。
 */
export async function DELETE(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

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
    await migrateLegacyOrgLayoutOnce();
    const removedTaskProblems = await deleteTaskProblemsMasterFile(auth.organizationId, taskId);
    const removedTaskProblemsFirestore = await deleteTaskProblemsMasterFromFirestore(
      auth.organizationId,
      taskId,
    );
    const removedTeacherSetup = await deleteTeacherProofreadingSetup(auth.organizationId, taskId);

    if (!removedTaskProblems && !removedTaskProblemsFirestore && !removedTeacherSetup) {
      return NextResponse.json(
        {
          ok: false,
          message: `課題ID「${taskId}」に対応するサーバー上のファイルは見つかりませんでした（すでに削除済みの可能性があります）。`,
        },
        { status: 404 },
      );
    }

    const parts: string[] = [];
    if (removedTaskProblems || removedTaskProblemsFirestore) parts.push("提出プルダウン用の課題マスタ");
    if (removedTeacherSetup) parts.push("課題・添削設定の保存 JSON");
    return NextResponse.json({
      ok: true,
      message: `削除しました: ${parts.join("、")}。既存の提出データはそのまま残ります。`,
      removed: {
        taskProblemsFile: removedTaskProblems,
        taskProblemsFirestore: removedTaskProblemsFirestore,
        teacherSetup: removedTeacherSetup,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "削除に失敗しました。" },
      { status: 500 },
    );
  }
}
