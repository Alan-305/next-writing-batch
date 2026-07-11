import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import {
  buildReportSummary,
  parseReportFilterSearchParams,
} from "@/lib/ops/reports/build-report-summary";
import { listRegisteredTasks } from "@/lib/registered-tasks-list";
import { listSubmissionsReadOnly } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 教員向け: 内容点・文法点の分布・課題別平均・個人推移 */
export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  try {
    const url = new URL(request.url);
    const filters = parseReportFilterSearchParams(url);
    const [submissions, registeredTasks] = await Promise.all([
      listSubmissionsReadOnly(auth.organizationId),
      listRegisteredTasks(auth.organizationId),
    ]);
    const summary = buildReportSummary(submissions, filters);
    const labelByTaskId = new Map(registeredTasks.map((t) => [t.taskId, t.displayLabel]));
    const { rows: _rows, ...summaryPublic } = summary;

    return NextResponse.json({
      ok: true,
      organizationId: auth.organizationId,
      filters,
      summary: {
        ...summaryPublic,
        byTask: summaryPublic.byTask.map((row) => ({
          ...row,
          displayLabel: labelByTaskId.get(row.taskId) ?? row.taskId,
        })),
      },
      taskOptions: registeredTasks.map((t) => ({
        taskId: t.taskId,
        displayLabel: t.displayLabel,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "集計に失敗しました。" },
      { status: 500 },
    );
  }
}
