import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { getSubmissions } from "@/lib/submissions-store";
import { runDay4Batch } from "@/lib/run-day4-batch";

/** Day4 は TTS / PDF 生成で時間がかかることがある（batch 側タイムアウトに合わせ長め） */
export const maxDuration = 900;
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  workers?: number;
  force?: boolean;
  submissionIds?: unknown;
  submissionId?: string;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const rawIds = body.submissionIds;
  const submissionIds = Array.isArray(rawIds)
    ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
    : (body.submissionId ?? "").trim()
      ? [String(body.submissionId).trim()]
      : [];

  if (submissionIds.length > 0) {
    const allowed = new Set(
      (await getSubmissions(auth.organizationId)).map((s) => String(s.submissionId ?? "").trim()),
    );
    if (submissionIds.some((id) => !allowed.has(id))) {
      return NextResponse.json(
        { ok: false, message: "指定された受付IDの一部が、この組織の提出に含まれません。" },
        { status: 403 },
      );
    }
  }

  const result = await runDay4Batch({
    organizationId: auth.organizationId,
    taskId: String(body.taskId ?? ""),
    workers: body.workers,
    force: Boolean(body.force),
    submissionIds: submissionIds.length ? submissionIds : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: result.error,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Day4 バッチが完了しました。画面を再読み込みしてください。",
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
