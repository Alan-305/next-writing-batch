import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { addSubmission, getSubmissions } from "@/lib/submissions-store";
import { hydrateSubmissionForRegisteredTask } from "@/lib/submission-task-hydration";
import { normalizeSubmissionFromBody, validateSubmissionInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  await migrateLegacyOrgLayoutOnce();
  const submissions = await getSubmissions(auth.organizationId);
  return NextResponse.json({ ok: true, data: submissions });
}

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const input = normalizeSubmissionFromBody(body);

  const errors = validateSubmissionInput(input);
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

  const hydrated = await hydrateSubmissionForRegisteredTask(auth.organizationId, input);
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

  const errors2 = validateSubmissionInput(hydrated.input);
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
