import { NextResponse } from "next/server";

import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";

type RouteContext = { params: Promise<{ taskId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { taskId: raw } = await context.params;
  const taskId = decodeURIComponent(raw || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, message: "taskId is required" }, { status: 400 });
  }
  const master = await loadTaskProblemsMaster(taskId);
  if (!master) {
    return NextResponse.json(
      { ok: false, message: "Task master not found", taskId },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, master });
}
