import path from "path";
import { NextResponse } from "next/server";

import { sanitizeProofreadingSetup } from "@/lib/proofreading-setup-json";
import { syncTaskProblemsFromProofreadingSetup } from "@/lib/sync-task-problems-from-teacher-setup";
import {
  loadTeacherProofreadingSetup,
  saveTeacherProofreadingSetup,
  teacherProofreadingSetupFilePath,
} from "@/lib/teacher-proofreading-setup-store";
import { taskProblemsFilePath } from "@/lib/load-task-problems-master";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const u = new URL(request.url);
  const taskId = (u.searchParams.get("taskId") || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, message: "taskId が必要です。" }, { status: 400 });
  }
  const taskErr = validateTaskIdForStorage(taskId);
  if (taskErr) {
    return NextResponse.json({ ok: false, message: taskErr }, { status: 422 });
  }
  const setup = await loadTeacherProofreadingSetup(taskId);
  if (!setup) {
    return NextResponse.json(
      { ok: false, message: `課題ID「${taskId}」の保存済み設定が見つかりません。` },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, setup });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が不正です。" }, { status: 400 });
  }

  const setup = sanitizeProofreadingSetup(body);
  if (!setup.task_id.trim()) {
    return NextResponse.json({ ok: false, message: "課題ID（task_id）が必要です。" }, { status: 422 });
  }
  if (!setup.question.trim()) {
    return NextResponse.json({ ok: false, message: "問題文（question）が必要です。" }, { status: 422 });
  }

  const taskErr = validateTaskIdForStorage(setup.task_id);
  if (taskErr) {
    return NextResponse.json({ ok: false, message: taskErr }, { status: 422 });
  }

  try {
    await saveTeacherProofreadingSetup(setup);
    await syncTaskProblemsFromProofreadingSetup(setup);
    const tid = setup.task_id.trim();
    const cwd = process.cwd();
    const relTeacher = path.relative(cwd, teacherProofreadingSetupFilePath(tid)) || teacherProofreadingSetupFilePath(tid);
    const relProblems = path.relative(cwd, taskProblemsFilePath(tid)) || taskProblemsFilePath(tid);
    return NextResponse.json({
      ok: true,
      taskId: tid,
      message:
        `課題ID「${tid}」としてサーバーに保存しました。課題マスタ（提出フォームのリスト・添削の問題文）も更新しました。提出詳細の修正入力にも反映されます。` +
        ` 保存ファイル: ${relTeacher} · ${relProblems}（エディタや Finder で確認できます。Next はプロジェクト直下を cwd にします）`,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "保存に失敗しました。" },
      { status: 500 },
    );
  }
}
