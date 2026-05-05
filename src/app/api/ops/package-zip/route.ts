import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { getSubmissions } from "@/lib/submissions-store";
import { runPackageZipSelection } from "@/lib/run-package-zip-batch";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Body = {
  mode?: unknown;
  taskId?: unknown;
  submissionIds?: unknown;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const mode = String(body.mode ?? "").trim();
  const orgId = auth.organizationId;

  if (mode === "task") {
    const taskId = String(body.taskId ?? "").trim();
    const result = await runPackageZipSelection({ organizationId: orgId, mode: "task", taskId });
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
      message: "課題単位の ZIP を作成しました。納品ZIPページでダウンロードできます。",
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  if (mode === "selection") {
    const raw = body.submissionIds;
    const submissionIds = Array.isArray(raw)
      ? raw.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const allowed = new Set(
      (await getSubmissions(orgId)).map((s) => String(s.submissionId ?? "").trim()),
    );
    const filtered = submissionIds.filter((id) => allowed.has(id));
    if (filtered.length !== submissionIds.length) {
      return NextResponse.json(
        { ok: false, message: "選択の一部がこの組織の提出に含まれません。" },
        { status: 403 },
      );
    }
    const result = await runPackageZipSelection({
      organizationId: orgId,
      mode: "selection",
      submissionIds: filtered,
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
      message: "選択した提出の ZIP を作成しました。納品ZIPページでダウンロードできます。",
      durationMs: result.durationMs,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }

  return NextResponse.json(
    { ok: false, message: "mode は task または selection を指定してください。" },
    { status: 400 },
  );
}
