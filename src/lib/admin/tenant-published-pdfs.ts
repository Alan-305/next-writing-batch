import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { fetchSubmissionPdfFromGcs } from "@/lib/day4-pdf-gcs-fetch";
import { pdfGcsObjectCandidates } from "@/lib/day4-pdf-filename";
import { defaultOrganizationId } from "@/lib/organization-id";
import { resolveSubmissionPdfAbsPath } from "@/lib/run-resolve-submission-pdf";
import { getOutputFileResponse } from "@/lib/serve-output-file";
import {
  getSubmissionByIdInOrganizationReadOnly,
  listSubmissionsReadOnly,
  type Submission,
} from "@/lib/submissions-store";
import { gcsBucketCandidates } from "@/lib/gcs-bucket-candidates";

/** テナント向け API レスポンス用（内部パス・確定日時は含めない） */
export type TenantPublishedPdfRow = {
  submissionId: string;
  taskId: string;
  studentId: string;
  studentName: string;
  publishedAt: string;
  scoreTotal: number | null;
  pdfAvailable: boolean;
};

function pdfPathToOutputSegments(pdfPath: string): string[] | null {
  const rel = pdfPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return null;
  const withoutOutput = rel.startsWith("output/") ? rel.slice("output/".length) : rel;
  const parts = withoutOutput.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] !== "pdf") return null;
  return parts;
}

function submissionOrganizationId(submission: Submission): string {
  return (submission.organizationId ?? "").trim() || defaultOrganizationId();
}

function submissionBelongsToOrganization(submission: Submission, organizationId: string): boolean {
  return submissionOrganizationId(submission) === organizationId;
}

function isPublishedToStudents(submission: Submission): boolean {
  return Boolean(String(submission.studentRelease?.operatorApprovedAt ?? "").trim());
}

function pdfIsDeliverable(submission: Submission): boolean {
  const d4 = submission.day4;
  if (!d4 || String(d4.error ?? "").trim()) return false;
  return Boolean(String(d4.pdf_path ?? "").trim());
}

/**
 * 公開済み提出一覧（読み取り専用）。管理画面から生徒向け /result を開く用途。
 * studentResultFirstViewedAt や提出 status には一切触れない。
 */
export async function listTenantPublishedPdfs(organizationId: string): Promise<TenantPublishedPdfRow[]> {
  const submissions = await listSubmissionsReadOnly(organizationId);
  const rows: TenantPublishedPdfRow[] = [];

  for (const s of submissions) {
    if (!submissionBelongsToOrganization(s, organizationId)) continue;
    if (!isPublishedToStudents(s)) continue;
    const sr = s.studentRelease;
    const publishedAt = String(sr?.operatorApprovedAt ?? "").trim();
    rows.push({
      submissionId: s.submissionId,
      taskId: String(s.taskId ?? "").trim() || "—",
      studentId: String(s.studentId ?? "").trim() || "—",
      studentName: String(s.studentName ?? "").trim() || "—",
      publishedAt,
      scoreTotal: typeof sr?.scoreTotal === "number" && Number.isFinite(sr.scoreTotal) ? sr.scoreTotal : null,
      pdfAvailable: pdfIsDeliverable(s),
    });
  }

  rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return rows;
}

const ADMIN_PDF_RESPONSE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function pdfResponseFromBuffer(buf: Buffer, filename: string): NextResponse {
  const name = filename.replace(/"/g, "") || "feedback.pdf";
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      ...ADMIN_PDF_RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

/**
 * 管理者による PDF 閲覧（読み取り専用・テナント非通知）。
 * mark-viewed / 提出更新 / チケット消費などは行わない。
 */
export async function getAdminPublishedPdfResponse(
  organizationId: string,
  submissionId: string,
): Promise<NextResponse> {
  const id = submissionId.trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: "受付IDが必要です。" }, { status: 400 });
  }

  const submission = await getSubmissionByIdInOrganizationReadOnly(organizationId, id);
  if (!submission) {
    return NextResponse.json({ ok: false, message: "提出が見つかりません。" }, { status: 404 });
  }
  if (!submissionBelongsToOrganization(submission, organizationId)) {
    return NextResponse.json({ ok: false, message: "このテナントの提出ではありません。" }, { status: 403 });
  }
  if (!isPublishedToStudents(submission)) {
    return NextResponse.json({ ok: false, message: "生徒に公開されていない提出です。" }, { status: 403 });
  }
  if (!pdfIsDeliverable(submission)) {
    return NextResponse.json({ ok: false, message: "公開済み PDF が見つかりません。" }, { status: 404 });
  }

  const pdfPath = String(submission.day4?.pdf_path ?? "").trim();
  const segments = pdfPathToOutputSegments(pdfPath);
  if (segments) {
    const local = await getOutputFileResponse(segments, { forceDownload: false });
    if (local.status === 200) {
      const headers = new Headers(local.headers);
      for (const [key, value] of Object.entries(ADMIN_PDF_RESPONSE_HEADERS)) {
        headers.set(key, value);
      }
      return new NextResponse(local.body, { status: local.status, headers });
    }
  }

  const gcsHit = await fetchSubmissionPdfFromGcs(submission);
  if (gcsHit) {
    const name = gcsHit.gcsObject.split("/").pop() ?? "feedback.pdf";
    return pdfResponseFromBuffer(gcsHit.buffer, name);
  }

  const resolved = await resolveSubmissionPdfAbsPath(organizationId, id);
  if (resolved.ok) {
    try {
      const buf = await readFile(resolved.absPath);
      const name = resolved.absPath.split("/").pop() ?? "feedback.pdf";
      return pdfResponseFromBuffer(buf, name);
    } catch (e) {
      console.error("[admin-published-pdf] resolved file read failed", { organizationId, submissionId: id, e });
    }
  } else {
    console.warn("[admin-published-pdf] python resolve failed", {
      organizationId,
      submissionId: id,
      error: resolved.error,
      stderr: resolved.stderr,
    });
  }

  console.error("[admin-published-pdf] PDF unavailable", {
    organizationId,
    submissionId: id,
    pdfPath,
    gcsObjects: pdfGcsObjectCandidates(submission),
    buckets: gcsBucketCandidates(),
  });
  return NextResponse.json({ ok: false, message: "PDF ファイルを取得できませんでした。" }, { status: 404 });
}
