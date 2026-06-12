import { NextResponse } from "next/server";

import {
  generateAutoDisplayNick,
  generateRedeemId,
  normalizeStudentNicknameInput,
} from "@/lib/anonymous-redeem";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import { hydrateSubmissionForRegisteredTask } from "@/lib/submission-task-hydration";
import { findSubmissionByRedeemLookup, addSubmission } from "@/lib/submissions-store";
import { notifyTeachersNewSubmission } from "@/lib/notifications/teacher-notify";
import { normalizeSubmissionFromBody, validateAuthenticatedSubmissionInput } from "@/lib/validation";

export const runtime = "nodejs";

type AnonymousBody = {
  organizationId?: unknown;
  nickname?: unknown;
  displayNick?: unknown;
  redeemId?: unknown;
};

/** 匿名提出（Google ログイン不要・招待 org 必須） */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const orgRaw = String((body as AnonymousBody)?.organizationId ?? "").trim();
  const organizationId = sanitizeOrganizationIdForPath(orgRaw);
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId（招待リンクの org）が必要です。" }, { status: 400 });
  }

  const input = normalizeSubmissionFromBody(body);
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

  await migrateLegacyOrgLayoutOnce();
  const hydrated = await hydrateSubmissionForRegisteredTask(organizationId, stripped);
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

  const nickInput = normalizeStudentNicknameInput(
    String((body as AnonymousBody)?.nickname ?? (body as AnonymousBody)?.displayNick ?? ""),
  );
  const displayNick = nickInput || generateAutoDisplayNick();
  let redeemId = "";
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateRedeemId();
    const existing = await findSubmissionByRedeemLookup(organizationId, {
      displayNick,
      redeemId: candidate,
    });
    if (!existing) {
      redeemId = candidate;
      break;
    }
  }
  if (!redeemId) {
    return NextResponse.json({ ok: false, message: "引換IDの生成に失敗しました。再度お試しください。" }, { status: 503 });
  }

  const submission = await addSubmission(organizationId, hydrated.input, {
    redeemId,
    displayNick,
  });

  void notifyTeachersNewSubmission({
    organizationId,
    submittedByUid: "",
    submissionId: submission.submissionId,
    taskId: submission.taskId,
    studentId: "",
    studentName: displayNick,
  }).catch((e) => console.error("[anonymous-submissions][notify-new]", e));

  return NextResponse.json({
    ok: true,
    message: "提出を受け付けました。",
    submissionId: submission.submissionId,
    displayNick,
    redeemId,
    organizationId,
  });
}
