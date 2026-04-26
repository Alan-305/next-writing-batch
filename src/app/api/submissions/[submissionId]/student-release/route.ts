import { NextResponse } from "next/server";

import { buildStudentReleaseFromPatch, type StudentReleasePatchBody } from "@/lib/student-release";
import { splitExplanationIntoContentGrammarSections } from "@/lib/student-release";
import { submissionNotFoundBody } from "@/lib/submission-not-found-response";
import { getSubmissionById, updateSubmissionById } from "@/lib/submissions-store";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { postAnalysisPhase1ToAppsScript } from "@/lib/nexus-support";
import { persistTaskRubricDefaultScores } from "@/lib/task-rubric-default-scores";

type RouteContext = { params: Promise<{ submissionId: string }> };

function countEnglishWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const words = t.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return words ? words.length : 0;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { submissionId } = await context.params;
  const sid = decodeURIComponent(submissionId || "").trim();
  if (!sid) {
    return NextResponse.json({ ok: false, message: "submissionId is required" }, { status: 400 });
  }

  const submission = await getSubmissionById(sid);
  if (!submission) {
    return NextResponse.json(submissionNotFoundBody(), { status: 404 });
  }

  const master = await loadTaskProblemsMaster(submission.taskId);
  if (!master) {
    return NextResponse.json(
      {
        ok: false,
        code: "TASK_MASTER_MISSING",
        message: `課題マスタが見つかりません: data/task-problems/${submission.taskId}.json`,
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
          message: "生徒に公開する前に「確定」を押して運用文面を確定してください。",
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
            "Day4 の成果物（PDF）がまだないかエラー状態です。「確定」のあと Day4 が完了するまで待ち、再読み込みしてから公開してください。手元では batch/run_day4_tts_qr_pdf.py も実行できます。",
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

  const updated = await updateSubmissionById(sid, (row) => ({
    ...row,
    studentRelease: release,
  }));

  if (updated) {
    await persistTaskRubricDefaultScores(submission.taskId, master, release.scores);

    const prevFinalizedAt = String(submission.studentRelease?.operatorFinalizedAt ?? "").trim();
    const nextFinalizedAt = String(release.operatorFinalizedAt ?? "").trim();
    const finalizedNow = Boolean(nextFinalizedAt) && nextFinalizedAt !== prevFinalizedAt;
    if (finalizedNow) {
      const sections = splitExplanationIntoContentGrammarSections(release.explanation || "");
      const analysisOk = await postAnalysisPhase1ToAppsScript({
        taskId: submission.taskId,
        submissionId: sid,
        problemMemo: (submission.problemMemo ?? "").trim(),
        evaluation: release.evaluation,
        explanationContent: sections.contentComment,
        explanationGrammar: sections.grammarComment,
        contentDeduction: release.contentDeduction,
        grammarDeduction: release.grammarDeduction,
        scoreTotal: release.scoreTotal,
        wordCount: countEnglishWords(release.finalText || ""),
        source: "ops",
      });
      if (!analysisOk) {
        console.warn("[student-release] analysis_phase1 post failed:", sid);
      }
    }
  }

  return NextResponse.json({ ok: true, studentRelease: updated?.studentRelease ?? release });
}
