import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { defaultScoresFromTeacherSetup } from "@/lib/build-rubric-scores-for-editor";
import { enrichSubmissionWithResolvedStudentFields } from "@/lib/submission-display-enrich";
import { findSubmissionForTenant } from "@/lib/submission-tenant-assert";
import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { loadTaskRubricDefaultScores } from "@/lib/task-rubric-default-scores";
import { loadTeacherProofreadingSetup } from "@/lib/teacher-proofreading-setup-store";

type RouteContext = { params: Promise<{ submissionId: string }> };

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 運用「提出詳細」用: 認証ユーザーのテナントに属する提出と関連マスタをまとめて返す */
export async function GET(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const { submissionId: raw } = await context.params;
  const sid = decodeURIComponent(raw || "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const hit = await findSubmissionForTenant(sid, auth.organizationId);
  if (!hit) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }

  const orgId = hit.organizationId;
  const submission = await enrichSubmissionWithResolvedStudentFields(hit.submission);

  const [master, taskRubricDefaults, teacherSetupJson] = await Promise.all([
    loadTaskProblemsMaster(orgId, submission.taskId),
    loadTaskRubricDefaultScores(orgId, submission.taskId),
    loadTeacherProofreadingSetup(orgId, submission.taskId),
  ]);
  const teacherSetupDefaults =
    master && teacherSetupJson ? defaultScoresFromTeacherSetup(master, teacherSetupJson) : {};

  return NextResponse.json({
    ok: true,
    submission,
    master,
    taskRubricDefaults,
    teacherSetupJson,
    teacherSetupDefaults,
  });
}
