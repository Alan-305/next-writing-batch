import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { unstable_noStore as noStore } from "next/cache";

import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import { defaultOrganizationId } from "@/lib/organization-id";
import { migrateLegacyOrgLayoutOnce, organizationSubmissionsFilePath, listOrganizationIdsOnDisk } from "@/lib/org-data-layout";
import type { StudentRelease } from "@/lib/student-release";
import type { SubmissionInput } from "@/lib/validation";

export type Submission = SubmissionInput & {
  submissionId: string;
  submittedAt: string;
  /** 提出が属するテナント（未設定の旧データは読み取り時に default とみなす） */
  organizationId?: string;
  /** 提出 API が検証した Firebase Auth uid（ログイン提出時） */
  submittedByUid?: string;
  status: "pending" | "processing" | "done" | "failed";
  /** 生徒が公開済み添削結果ページを初めて開いた日時（運用一覧の Viewed 表示用） */
  studentResultFirstViewedAt?: string;
  /** 運用が編集・公開した生徒向け確定データ（やり方A: ルーブリック得点＋合計＋テキスト） */
  studentRelease?: StudentRelease;
  proofread?: {
    /** この添削結果を生成したときの提出の taskId（課題ID変更後の不一致検出用） */
    sourceTaskId?: string;
    startedAt?: string;
    finishedAt?: string;
    /** Nexus Learning（ESSAY_PROMPT）形式 */
    evaluation?: string;
    general_comment?: string;
    explanation?: string;
    content_comment?: string;
    grammar_comment?: string;
    content_deduction?: number;
    grammar_deduction?: number;
    final_version?: string;
    /** 旧 Day3 JSON 形式（互換） */
    line1_feedback?: string;
    line2_improvement?: string;
    line3_next_action?: string;
    final_essay?: string;
    model_name?: string;
    generated_at?: string;
    error?: string;
    operator_message?: string;
  };
  day4?: {
    audio_path?: string;
    audio_url?: string;
    qr_path?: string;
    pdf_path?: string;
    generatedAt?: string;
    error?: string;
    operator_message?: string;
  };
};

function effectiveOrganizationId(row: Submission): string {
  const raw = (row.organizationId ?? "").trim();
  return raw || defaultOrganizationId();
}

async function ensureDataFile(organizationId: string): Promise<void> {
  await migrateLegacyOrgLayoutOnce();
  const fp = organizationSubmissionsFilePath(organizationId);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  try {
    await fs.access(fp);
  } catch {
    await writeJsonFileAtomic(fp, []);
  }
}

export async function getSubmissions(organizationId: string): Promise<Submission[]> {
  noStore();
  await ensureDataFile(organizationId);
  const fp = organizationSubmissionsFilePath(organizationId);
  const content = await fs.readFile(fp, "utf8");
  const parsed = JSON.parse(content) as Submission[];
  return parsed.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getSubmissionByIdInOrganization(
  organizationId: string,
  submissionId: string,
): Promise<Submission | null> {
  const submissions = await getSubmissions(organizationId);
  return submissions.find((s) => s.submissionId === submissionId) ?? null;
}

export type SubmissionWithOrganization = { submission: Submission; organizationId: string };

/** 受付 ID はテナント横断で一意とし、公開用リンクなどで検索する。 */
export async function findSubmissionAcrossOrganizations(
  submissionId: string,
): Promise<SubmissionWithOrganization | null> {
  noStore();
  await migrateLegacyOrgLayoutOnce();
  const sid = (submissionId ?? "").trim();
  if (!sid) return null;

  const orgIds = await listOrganizationIdsOnDisk();
  for (const oid of orgIds) {
    const row = await getSubmissionByIdInOrganization(oid, sid);
    if (row) {
      return { submission: row, organizationId: oid };
    }
  }
  return null;
}

export async function getSubmissionById(submissionId: string): Promise<Submission | null> {
  const hit = await findSubmissionAcrossOrganizations(submissionId);
  return hit?.submission ?? null;
}

/** 全角半角・連続空白をそろえて比較 */
function normalizeLookupToken(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * 同一テナント内で、課題ID・学籍番号・氏名が一致する提出のうち最新の1件。
 */
export async function findLatestSubmissionByStudentLookup(
  organizationId: string,
  args: { taskId: string; studentId: string; studentName: string },
): Promise<Submission | null> {
  const taskId = normalizeLookupToken(args.taskId);
  const studentId = normalizeLookupToken(args.studentId);
  const studentName = normalizeLookupToken(args.studentName);
  if (!taskId || !studentId || !studentName) return null;

  const submissions = await getSubmissions(organizationId);
  const matches = submissions.filter(
    (s) =>
      normalizeLookupToken(s.taskId) === taskId &&
      normalizeLookupToken(s.studentId) === studentId &&
      normalizeLookupToken(s.studentName) === studentName,
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  return matches[0] ?? null;
}

export async function deleteSubmissionByIdInOrganization(
  organizationId: string,
  submissionId: string,
): Promise<boolean> {
  await ensureDataFile(organizationId);
  const fp = organizationSubmissionsFilePath(organizationId);
  const content = await fs.readFile(fp, "utf8");
  const rows = JSON.parse(content) as Submission[];
  const next = rows.filter((s) => s.submissionId !== submissionId);
  if (next.length === rows.length) return false;
  await writeJsonFileAtomic(fp, next);
  return true;
}

export async function deleteSubmissionById(submissionId: string): Promise<boolean> {
  const hit = await findSubmissionAcrossOrganizations(submissionId);
  if (!hit) return false;
  return deleteSubmissionByIdInOrganization(hit.organizationId, submissionId);
}

export async function updateSubmissionByIdInOrganization(
  organizationId: string,
  submissionId: string,
  updater: (row: Submission) => Submission,
): Promise<Submission | null> {
  await ensureDataFile(organizationId);
  const fp = organizationSubmissionsFilePath(organizationId);
  const content = await fs.readFile(fp, "utf8");
  const rows = JSON.parse(content) as Submission[];
  const idx = rows.findIndex((s) => s.submissionId === submissionId);
  if (idx < 0) return null;
  const next = updater(rows[idx]!);
  rows[idx] = next;
  await writeJsonFileAtomic(fp, rows);
  return next;
}

export async function updateSubmissionById(
  submissionId: string,
  updater: (row: Submission) => Submission,
): Promise<Submission | null> {
  const hit = await findSubmissionAcrossOrganizations(submissionId);
  if (!hit) return null;
  return updateSubmissionByIdInOrganization(hit.organizationId, submissionId, updater);
}

export async function addSubmission(
  organizationId: string,
  input: SubmissionInput,
  opts?: { submittedByUid?: string },
): Promise<Submission> {
  const q = (input.question ?? "").trim();
  const memo = (input.problemMemo ?? "").trim();
  const multipart =
    Boolean(input.essayMultipart) &&
    Array.isArray(input.essayParts) &&
    input.essayParts.length >= 2;
  const pid = (input.problemId ?? "").trim();

  const submission: Submission = {
    submissionId: randomUUID(),
    submittedAt: new Date().toISOString(),
    organizationId,
    status: "pending",
    taskId: input.taskId.trim(),
    studentId: input.studentId.trim(),
    studentName: input.studentName.trim(),
    essayText: input.essayText.trim(),
    ...(opts?.submittedByUid ? { submittedByUid: opts.submittedByUid } : {}),
    ...(q ? { question: q } : {}),
    ...(memo ? { problemMemo: memo } : {}),
    ...(pid ? { problemId: pid } : {}),
    ...(multipart
      ? {
          essayMultipart: true,
          essayParts: input.essayParts!.map((p) => p.trim()),
        }
      : {}),
  };

  const current = await getSubmissions(organizationId);
  current.unshift(submission);
  await writeJsonFileAtomic(organizationSubmissionsFilePath(organizationId), current);
  return submission;
}
