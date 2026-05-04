import { NextResponse } from "next/server";

import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { addSubmission, getSubmissions } from "@/lib/submissions-store";
import { hydrateSubmissionForRegisteredTask } from "@/lib/submission-task-hydration";
import { normalizeSubmissionFromBody, validateSubmissionInput } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const submissions = await getSubmissions();
  return NextResponse.json({ ok: true, data: submissions });
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
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

  const hydrated = await hydrateSubmissionForRegisteredTask(input);
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

  const submission = await addSubmission(hydrated.input, { submittedByUid: auth.uid });
  return NextResponse.json({
    ok: true,
    submissionId: submission.submissionId,
    message: "提出を受け付けました。",
  });
}
