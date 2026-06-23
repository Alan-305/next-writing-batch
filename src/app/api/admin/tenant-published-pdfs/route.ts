import { NextResponse } from "next/server";

import { listTenantPublishedPdfs } from "@/lib/admin/tenant-published-pdfs";
import { adminReadOnlyMethodNotAllowed, requireAdminReadOnlyContext } from "@/lib/admin/require-admin-read-only";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await requireAdminReadOnlyContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const rows = await listTenantPublishedPdfs(ctx.organizationId);
    return NextResponse.json({
      ok: true,
      organizationId: ctx.organizationId,
      readOnly: true,
      total: rows.length,
      pdfAvailableCount: rows.filter((r) => r.pdfAvailable).length,
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "取得に失敗しました。" },
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
