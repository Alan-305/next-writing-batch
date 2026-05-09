import { NextResponse } from "next/server";

import { loadUserProfileAdmin } from "@/lib/auth/load-user-profile-admin";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { canManageTenantOperations } from "@/lib/auth/require-teacher-or-allowlist";
import { isTeacherByRoles, needsStudentSubjectProfile, normalizeRoles } from "@/lib/auth/user-roles";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { enrichSubmissionsWithResolvedStudentFields } from "@/lib/submission-display-enrich";
import { addSubmission, getSubmissions } from "@/lib/submissions-store";
import { isStudentProfileComplete } from "@/lib/student-profile-gate";
import { hydrateSubmissionForRegisteredTask } from "@/lib/submission-task-hydration";
import { normalizeSubmissionFromBody, validateAuthenticatedSubmissionInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  await migrateLegacyOrgLayoutOnce();
  let submissions = await getSubmissions(auth.organizationId);
  if (!(await canManageTenantOperations(auth.uid))) {
    submissions = submissions.filter((s) => String(s.submittedByUid ?? "").trim() === auth.uid);
  }
  const data = await enrichSubmissionsWithResolvedStudentFields(submissions);
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const profileRow = await loadUserProfileAdmin(auth.uid);
  const roles = profileRow ? normalizeRoles(profileRow.roles) : [];
  const skipStudentProfile = isTeacherByRoles(roles);
  if (!skipStudentProfile && needsStudentSubjectProfile(roles)) {
    if (!isStudentProfileComplete(roles, profileRow)) {
      return NextResponse.json(
        {
          ok: false,
          code: "PROFILE_INCOMPLETE",
          message:
            "学籍番号とニックネームの登録が完了していません。初回登録またはプロフィール設定を完了してください。",
        },
        { status: 422 },
      );
    }
  }

  const body = await request.json();
  const input = normalizeSubmissionFromBody(body);
  /** クライアントから送られた学籍・氏名は保存しない（PII は users/{uid} のみ） */
  const stripped = { ...input, studentId: "", studentName: "" };

  const errors = validateAuthenticatedSubmissionInput(stripped);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "入力内容を確認してください。",
        fields: errors,
      },
      { status: 422 },
    );
  }

  const hydrated = await hydrateSubmissionForRegisteredTask(auth.organizationId, stripped);
  if (!hydrated.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNKNOWN_TASK",
        message: hydrated.message,
        fields: hydrated.fields,
      },
      { status: 422 },
    );
  }

  const errors2 = validateAuthenticatedSubmissionInput(hydrated.input);
  if (Object.keys(errors2).length > 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "入力内容を確認してください。",
        fields: errors2,
      },
      { status: 422 },
    );
  }

  const submission = await addSubmission(auth.organizationId, hydrated.input, { submittedByUid: auth.uid });
  return NextResponse.json({
    ok: true,
    submissionId: submission.submissionId,
    message: "提出を受け付けました。",
  });
}
