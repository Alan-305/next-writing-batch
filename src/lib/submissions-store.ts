import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { unstable_noStore as noStore } from "next/cache";

import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import type { StudentRelease } from "@/lib/student-release";
import type { SubmissionInput } from "@/lib/validation";

export type Submission = SubmissionInput & {
  submissionId: string;
  submittedAt: string;
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

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await writeJsonFileAtomic(DATA_FILE, []);
  }
}

export async function getSubmissions(): Promise<Submission[]> {
  noStore();
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(content) as Submission[];
  return parsed.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getSubmissionById(submissionId: string): Promise<Submission | null> {
  const submissions = await getSubmissions();
  return submissions.find((s) => s.submissionId === submissionId) ?? null;
}

/** 照会フォーム用：全角半角・連続空白をそろえて比較 */
function normalizeLookupToken(s: string): string {
  return s.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * 課題ID・学籍番号・氏名が一致する提出のうち、提出日時が最新の1件を返す。
 */
export async function findLatestSubmissionByStudentLookup(args: {
  taskId: string;
  studentId: string;
  studentName: string;
}): Promise<Submission | null> {
  const taskId = normalizeLookupToken(args.taskId);
  const studentId = normalizeLookupToken(args.studentId);
  const studentName = normalizeLookupToken(args.studentName);
  if (!taskId || !studentId || !studentName) return null;

  const submissions = await getSubmissions();
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

export async function deleteSubmissionById(submissionId: string): Promise<boolean> {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf8");
  const rows = JSON.parse(content) as Submission[];
  const next = rows.filter((s) => s.submissionId !== submissionId);
  if (next.length === rows.length) return false;
  await writeJsonFileAtomic(DATA_FILE, next);
  return true;
}

export async function updateSubmissionById(
  submissionId: string,
  updater: (row: Submission) => Submission,
): Promise<Submission | null> {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf8");
  const rows = JSON.parse(content) as Submission[];
  const idx = rows.findIndex((s) => s.submissionId === submissionId);
  if (idx < 0) return null;
  const next = updater(rows[idx]!);
  rows[idx] = next;
  await writeJsonFileAtomic(DATA_FILE, rows);
  return next;
}

export async function addSubmission(
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

  const current = await getSubmissions();
  current.unshift(submission);
  await writeJsonFileAtomic(DATA_FILE, current);
  return submission;
}
