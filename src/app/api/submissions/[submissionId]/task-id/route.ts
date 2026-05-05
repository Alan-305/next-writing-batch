import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { hydrateSubmissionForRegisteredTask } from "@/lib/submission-task-hydration";
import { findSubmissionForTenant } from "@/lib/submission-tenant-assert";
import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { updateSubmissionById } from "@/lib/submissions-store";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";
import type { SubmissionInput } from "@/lib/validation";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const { submissionId: rawParam } = await context.params;
  const sid = decodeURIComponent(rawParam || "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const hit = await findSubmissionForTenant(sid, auth.organizationId);
  if (!hit) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }
  const submission = hit.submission;
  const orgId = hit.organizationId;

  if (submission.studentRelease?.operatorApprovedAt) {
    return NextResponse.json(
      {
        ok: false,
        code: "PUBLISHED",
        message: "生徒向け公開済みの提出は課題IDを変更できません。",
      },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が不正です。" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const nextTaskId = typeof o.taskId === "string" ? o.taskId : "";
  const taskErr = validateTaskIdForStorage(nextTaskId);
  if (taskErr) {
    return NextResponse.json({ ok: false, message: taskErr, fields: { taskId: taskErr } }, { status: 400 });
  }

  const multipart =
    Boolean(submission.essayMultipart) &&
    Array.isArray(submission.essayParts) &&
    submission.essayParts.length >= 2;

  const base: SubmissionInput = multipart
    ? {
        taskId: nextTaskId.trim(),
        studentId: submission.studentId,
        studentName: submission.studentName,
        essayText: submission.essayText,
        question: submission.question,
        problemMemo: submission.problemMemo,
        problemId: submission.problemId,
        essayMultipart: true,
        essayParts: submission.essayParts!.map((p) => String(p ?? "").trim()),
      }
    : {
        taskId: nextTaskId.trim(),
        studentId: submission.studentId,
        studentName: submission.studentName,
        essayText: submission.essayText,
        question: submission.question,
        problemMemo: submission.problemMemo,
        problemId: submission.problemId,
        essayMultipart: false,
      };

  const hydrated = await hydrateSubmissionForRegisteredTask(orgId, base);
  if (!hydrated.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "HYDRATE_FAILED",
        message: hydrated.message,
        fields: hydrated.fields,
      },
      { status: 422 },
    );
  }

  const h = hydrated.input;
  const prevTask = submission.taskId.trim();
  const changed = prevTask !== h.taskId.trim();

  const updated = await updateSubmissionById(sid, (row) => {
    const next = { ...row, taskId: h.taskId.trim(), essayText: h.essayText.trim() };
    if (h.problemId?.trim()) {
      next.problemId = h.problemId.trim();
    } else {
      delete next.problemId;
    }
    if ((h.question ?? "").trim()) {
      next.question = (h.question ?? "").trim();
    } else {
      delete next.question;
    }
    if (changed && row.day4 && Object.keys(row.day4).length > 0) {
      delete next.day4;
    }
    return next;
  });

  if (!updated) {
    return NextResponse.json({ ok: false, message: "更新に失敗しました。" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: changed
      ? "課題IDを更新し、マスタに合わせて設問・課題文を同期しました。再添削する場合は一覧の「添削やり直し」を実行してください。"
      : "変更はありません（同じ課題IDです）。",
    submission: updated,
  });
}
