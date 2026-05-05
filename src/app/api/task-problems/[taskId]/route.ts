import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";

type RouteContext = { params: Promise<{ taskId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const { taskId: raw } = await context.params;
  const taskId = decodeURIComponent(raw || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, message: "taskId is required" }, { status: 400 });
  }
  const master = await loadTaskProblemsMaster(auth.organizationId, taskId);
  if (!master) {
    return NextResponse.json(
      { ok: false, message: "Task master not found", taskId },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, master });
}
