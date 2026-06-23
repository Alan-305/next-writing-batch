import { NextResponse } from "next/server";

import { getAdminPublishedPdfResponse } from "@/lib/admin/tenant-published-pdfs";
import { adminReadOnlyMethodNotAllowed, requireAdminReadOnlyContext } from "@/lib/admin/require-admin-read-only";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const ctx = await requireAdminReadOnlyContext(request);
  if (!ctx.ok) return ctx.response;

  const { submissionId } = await context.params;

  try {
    return await getAdminPublishedPdfResponse(ctx.organizationId, submissionId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "PDF の取得に失敗しました。" },
      { status: 500 },
    );
  }
}

export async function POST() {
  return adminReadOnlyMethodNotAllowed();
}

export async function PUT() {
  return adminReadOnlyMethodNotAllowed();
}

export async function PATCH() {
  return adminReadOnlyMethodNotAllowed();
}

export async function DELETE() {
  return adminReadOnlyMethodNotAllowed();
}
