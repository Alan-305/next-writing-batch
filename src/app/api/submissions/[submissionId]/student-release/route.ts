import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import {
  normalizeEssayForCompare,
  sanitizeFinalEssayArtifactText,
} from "@/lib/student-final-essay-display";
import { buildStudentReleaseFromPatch, type StudentReleasePatchBody } from "@/lib/student-release";
import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { findSubmissionForTenant } from "@/lib/submission-tenant-assert";
import { updateSubmissionById } from "@/lib/submissions-store";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { persistTaskRubricDefaultScores } from "@/lib/task-rubric-default-scores";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const { submissionId } = await context.params;
  const sid = decodeURIComponent(submissionId || "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, message: "submissionId is required" }, { status: 400 });
  }

  const hit = await findSubmissionForTenant(sid, auth.organizationId);
  if (!hit) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }
  const submission = hit.submission;
  const orgId = hit.organizationId;

  const master = await loadTaskProblemsMaster(orgId, submission.taskId);
  if (!master) {
    return NextResponse.json(
      {
        ok: false,
        code: "TASK_MASTER_MISSING",
        message: `課題マスタが見つかりません（テナント: ${orgId}）: taskId=${submission.taskId}`,
        taskId: submission.taskId,
      },
      { status: 422 },
    );
  }

  let body: StudentReleasePatchBody;
  try {
    body = (await request.json()) as StudentReleasePatchBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }

  if (body.operatorApproved === true) {
    const prevFin = String(submission.studentRelease?.operatorFinalizedAt ?? "").trim();
    const finalizeInSameRequest = body.operatorFinalized === true;
    if (!prevFin && !finalizeInSameRequest) {
      return NextResponse.json(
        {
          ok: false,
          code: "FINALIZE_REQUIRED",
          message: "生徒に公開する前に「確定＆公開」で運用文面を確定してください。",
        },
        { status: 422 },
      );
    }
    const d4 = submission.day4;
    const pdfPath = String(d4?.pdf_path ?? "").trim();
    const pdfBlocked = Boolean(d4?.error) || !pdfPath;
    if (pdfBlocked) {
      return NextResponse.json(
        {
          ok: false,
          code: "DAY4_REQUIRED",
          message:
            "返却用 PDF がまだないかエラー状態です。「確定＆公開」で PDF・音声の生成が完了するまでお待ちください。",
        },
        { status: 422 },
      );
    }
  }

  const { release, errors } = buildStudentReleaseFromPatch(master, body, submission.studentRelease);
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

  const prevFinal = sanitizeFinalEssayArtifactText(submission.studentRelease?.finalText ?? "");
  const newFinal = sanitizeFinalEssayArtifactText(release.finalText ?? "");
  const finalTextChanged =
    normalizeEssayForCompare(prevFinal) !== normalizeEssayForCompare(newFinal);

  let updated: Awaited<ReturnType<typeof updateSubmissionById>>;
  try {
    updated = await updateSubmissionById(sid, (row) => {
      const next = { ...row, studentRelease: release };
      if (finalTextChanged && row.day4 && Object.keys(row.day4).length > 0) {
        delete next.day4;
      }
      return next;
    });
  } catch (e) {
    console.error("[student-release] updateSubmissionById", e);
    return NextResponse.json(
      {
        ok: false,
        code: "SAVE_FAILED",
        message:
          e instanceof Error
            ? e.message
            : "提出の保存に失敗しました（サーバー側のストレージエラーなど）。",
      },
      { status: 500 },
    );
  }

  if (!updated) {
    return NextResponse.json(
      {
        ok: false,
        code: "SAVE_FAILED",
        message:
          "提出の保存に失敗しました（ドキュメントが見つからない、または同時更新と競合した可能性があります）。",
      },
      { status: 409 },
    );
  }

  try {
    await persistTaskRubricDefaultScores(orgId, submission.taskId, master, release.scores);
  } catch (e) {
    console.warn("[student-release] persistTaskRubricDefaultScores failed (submission already saved):", e);
  }

  return NextResponse.json({ ok: true, studentRelease: updated.studentRelease ?? release });
}
