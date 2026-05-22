import { NextResponse } from "next/server";

import { processProofreadJob } from "@/lib/proofread/proofread-job";
import { verifyProofreadWorkerRequest } from "@/lib/proofread/verify-worker-auth";

/** 1 件の Claude 添削。Cloud Tasks から呼ばれる。 */
export const maxDuration = 900;
export const dynamic = "force-dynamic";

type Body = {
  organizationId?: string;
  submissionId?: string;
  jobId?: string;
};

export async function POST(request: Request) {
  if (!verifyProofreadWorkerRequest(request)) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const organizationId = String(body.organizationId ?? "").trim();
  const submissionId = String(body.submissionId ?? "").trim();
  const jobId = String(body.jobId ?? "").trim();

  const result = await processProofreadJob({ organizationId, submissionId, jobId });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, message: result.message },
      { status: result.code === "JOB_NOT_FOUND" ? 404 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    submissionStatus: result.submissionStatus,
  });
}
