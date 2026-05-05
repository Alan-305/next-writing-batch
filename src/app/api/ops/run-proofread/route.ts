import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { getSubmissions } from "@/lib/submissions-store";
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
    const bad = submissionIds.filter((id) => !allowed.has(id));
    if (bad.length > 0) {
      return NextResponse.json(
        { ok: false, message: "指定された受付IDの一部が、この組織の提出に含まれません。" },
        { status: 403 },
      );
    }
  }

  const result = await runProofreadBatch({
    organizationId: auth.organizationId,
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
