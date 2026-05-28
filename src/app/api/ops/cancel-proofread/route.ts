import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { cancelProofreadJob } from "@/lib/proofread/proofread-job";
import { getSubmissions } from "@/lib/submissions-store";

export const dynamic = "force-dynamic";

type Body = {
  submissionId?: string;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const submissionId = String(body.submissionId ?? "").trim();
  if (!submissionId) {
    return NextResponse.json({ ok: false, message: "submissionId が必要です。" }, { status: 400 });
  }

  const submissions = await getSubmissions(auth.organizationId);
  const allowed = submissions.some((s) => String(s.submissionId ?? "").trim() === submissionId);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: "指定された受付IDは、この組織の提出に含まれません。" },
      { status: 403 },
    );
  }

  const result = await cancelProofreadJob({
    organizationId: auth.organizationId,
    submissionId,
    requestedByUid: auth.uid,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "NOT_CANCELLABLE"
          ? 409
          : result.code === "VALIDATION_ERROR"
            ? 400
            : 503;
    return NextResponse.json({ ok: false, code: result.code, message: result.message }, { status });
  }

  return NextResponse.json({
    ok: true,
    message: "添削を中止しました。一覧の status が更新されます。",
    submissionStatus: result.submissionStatus,
  });
}

