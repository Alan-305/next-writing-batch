import { NextResponse } from "next/server";

import { runProofreadBatch } from "@/lib/run-proofread-batch";

/** 1 件でも Gemini が遅いと 5 分を超えることがある。exec の TIMEOUT_MS（14 分）に近づける。 */
export const maxDuration = 900;
export const dynamic = "force-dynamic";

type Body = {
  taskId?: string;
  workers?: number;
  limit?: number;
  retryFailed?: boolean;
  submissionIds?: unknown;
  submissionId?: string;
};

export async function POST(request: Request) {
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

  const result = await runProofreadBatch({
    taskId: String(body.taskId ?? ""),
    workers: body.workers,
    limit: body.limit,
    retryFailed: Boolean(body.retryFailed),
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
    message: "添削バッチが完了しました。一覧を再読み込みしてください。",
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}
