import { getStorage } from "firebase-admin/storage";
import { NextResponse } from "next/server";

import { getFirebaseAdminApp } from "@/lib/firebase/admin-app";
import { gcsBucketCandidates } from "@/lib/gcs-bucket-candidates";
import { defaultOrganizationId } from "@/lib/organization-id";
import { getOutputFileResponse } from "@/lib/serve-output-file";
import {
  getSubmissionByIdInOrganizationReadOnly,
  listSubmissionsReadOnly,
  type Submission,
} from "@/lib/submissions-store";

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

function pdfGcsObjectFromRel(pdfRel: string): string | null {
  const rel = pdfRel.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel) return null;
  if (rel.startsWith("output/pdf/")) return rel.slice("output/".length);
  if (rel.startsWith("pdf/")) return rel;
  return null;
}

function pdfGcsObjectFromDay4(day4: Submission["day4"]): string | null {
  if (!day4 || typeof day4 !== "object") return null;
  const explicit = String(day4.pdf_gcs_object ?? "").trim();
  if (explicit) return explicit;
  return pdfGcsObjectFromRel(String(day4.pdf_path ?? ""));
}

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
 * 公開済み PDF 一覧（読み取り専用）。
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

  const gcsObject = pdfGcsObjectFromDay4(submission.day4);
  const bucketCandidates = gcsBucketCandidates();
  if (!gcsObject || bucketCandidates.length === 0) {
    return NextResponse.json({ ok: false, message: "PDF ファイルを取得できませんでした。" }, { status: 404 });
  }

  const storage = getStorage(getFirebaseAdminApp());
  let lastError: unknown = null;
  for (const bucketName of bucketCandidates) {
    try {
      const file = storage.bucket(bucketName).file(gcsObject);
      const [exists] = await file.exists();
      if (!exists) continue;
      const [buf] = await file.download();
      const name = gcsObject.split("/").pop() ?? "feedback.pdf";
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          ...ADMIN_PDF_RESPONSE_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        },
      });
    } catch (e) {
      lastError = e;
      console.warn("[admin-published-pdf] GCS bucket miss", { bucketName, gcsObject, e });
    }
  }

  console.error("[admin-published-pdf] GCS read failed", {
    organizationId,
    submissionId: id,
    gcsObject,
    buckets: bucketCandidates,
    lastError,
  });
  return NextResponse.json({ ok: false, message: "PDF ファイルを取得できませんでした。" }, { status: 404 });
}
