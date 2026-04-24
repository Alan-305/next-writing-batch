import { NextResponse } from "next/server";

import { runPackageZipSelection } from "@/lib/run-package-zip-batch";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Body = {
  mode?: unknown;
  taskId?: unknown;
  submissionIds?: unknown;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが必要です。" }, { status: 400 });
  }

  const mode = String(body.mode ?? "").trim();
  if (mode === "task") {
    const taskId = String(body.taskId ?? "").trim();
    const result = await runPackageZipSelection({ mode: "task", taskId });
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
    const result = await runPackageZipSelection({ mode: "selection", submissionIds });
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
