import { NextResponse } from "next/server";

import { normalizeRedeemLookupToken } from "@/lib/anonymous-redeem";
import { notifyTeachersStudentReceiveMethod } from "@/lib/notifications/teacher-notify";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { sanitizeOrganizationIdForPath } from "@/lib/organization-id";
import {
  isStudentReceiveMethod,
  studentReceiveMethodLabel,
  type StudentReceiveMethod,
} from "@/lib/student-receive-method";
import { findSubmissionByRedeemLookup, updateSubmissionByIdInOrganization } from "@/lib/submissions-store";

export const runtime = "nodejs";

type Body = {
  organizationId?: unknown;
  displayNick?: unknown;
  nickname?: unknown;
  redeemId?: unknown;
  method?: unknown;
};

/** ニックネーム + 引換ID で、公開済み添削の受け取り方法を記録（ログイン不要） */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const organizationId = sanitizeOrganizationIdForPath(String(body.organizationId ?? "").trim());
  if (!organizationId) {
    return NextResponse.json({ ok: false, message: "organizationId（招待リンクの org）が必要です。" }, { status: 400 });
  }

  const displayNick = normalizeRedeemLookupToken(String(body.displayNick ?? body.nickname ?? ""));
  const redeemId = normalizeRedeemLookupToken(String(body.redeemId ?? ""));
  if (!displayNick || !redeemId) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "ニックネームと引換IDの両方を入力してください。" },
      { status: 422 },
    );
  }

  const methodRaw = body.method;
  if (!isStudentReceiveMethod(methodRaw)) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", message: "受け取り方法（web または teacher_meeting）を指定してください。" },
      { status: 422 },
    );
  }
  const method: StudentReceiveMethod = methodRaw;

  await migrateLegacyOrgLayoutOnce();
  const submission = await findSubmissionByRedeemLookup(organizationId, { displayNick, redeemId });
  if (!submission) {
    return NextResponse.json(
      { ok: false, code: "NOT_FOUND", message: "該当する提出が見つかりませんでした。" },
      { status: 404 },
    );
  }

  if (!submission.studentRelease?.operatorApprovedAt) {
    return NextResponse.json(
      { ok: false, code: "NOT_PUBLISHED", message: "添削結果がまだ公開されていません。" },
      { status: 422 },
    );
  }

  const existing = submission.studentReceiveMethod;
  if (existing) {
    if (existing === method) {
      return NextResponse.json({
        ok: true,
        changed: false,
        submissionId: submission.submissionId,
        method: existing,
        methodLabel: studentReceiveMethodLabel(existing),
        selectedAt: submission.studentReceiveMethodAt ?? null,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        code: "ALREADY_CHOSEN",
        message: `すでに「${studentReceiveMethodLabel(existing)}」を選択済みです。変更はできません。`,
        method: existing,
        methodLabel: studentReceiveMethodLabel(existing),
      },
      { status: 409 },
    );
  }

  const selectedAt = new Date().toISOString();
  const updated = await updateSubmissionByIdInOrganization(organizationId, submission.submissionId, (row) => ({
    ...row,
    studentReceiveMethod: method,
    studentReceiveMethodAt: selectedAt,
  }));
  if (!updated) {
    return NextResponse.json({ ok: false, message: "保存に失敗しました。" }, { status: 500 });
  }

  void notifyTeachersStudentReceiveMethod({
    organizationId,
    submissionId: submission.submissionId,
    taskId: submission.taskId,
    studentName: submission.studentName,
    method,
    selectedAt,
  }).catch((e) => console.error("[receive-method] teacher notify failed", e));

  return NextResponse.json({
    ok: true,
    changed: true,
    submissionId: submission.submissionId,
    method,
    methodLabel: studentReceiveMethodLabel(method),
    selectedAt,
  });
}
