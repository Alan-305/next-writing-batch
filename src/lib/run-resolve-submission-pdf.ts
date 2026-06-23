import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { resolveProofreadPython } from "@/lib/run-proofread-batch";
import { syncSubmissionsFileMirrorFromFirestore } from "@/lib/submissions-store";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 24 * 1024 * 1024;
const TIMEOUT_MS = 3 * 60 * 1000;

export type ResolveSubmissionPdfResult =
  | { ok: true; absPath: string; stdout: string; stderr: string }
  | { ok: false; error: string; stdout?: string; stderr?: string };

function resolveScriptPath(): string {
  return path.join(process.cwd(), "batch", "resolve_submission_pdf.py");
}

/**
 * Firestore ミラー → Python で PDF を GCS 取得または再生成し、ローカル絶対パスを返す。
 */
export async function resolveSubmissionPdfAbsPath(
  organizationId: string,
  submissionId: string,
): Promise<ResolveSubmissionPdfResult> {
  const sid = submissionId.trim();
  const oid = organizationId.trim();
  if (!sid || !oid) {
    return { ok: false, error: "organizationId と submissionId が必要です。" };
  }

  const script = resolveScriptPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: `スクリプトが見つかりません: ${script}` };
  }

  const python = resolveProofreadPython();
  if (!python) {
    return {
      ok: false,
      error: "Python が見つかりません（PROOFREAD_PYTHON または .venv を確認してください）。",
    };
  }

  try {
    await syncSubmissionsFileMirrorFromFirestore(oid);
  } catch (e) {
    console.warn("[resolve-submission-pdf] mirror sync failed", { organizationId: oid, submissionId: sid, e });
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env, NWB_ORGANIZATION_ID: oid };
  try {
    const { stdout, stderr } = await execFileAsync(python, [script, "--submission-id", sid], {
      cwd: process.cwd(),
      env: childEnv,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    const absPath = String(stdout ?? "").trim().split("\n").pop()?.trim() ?? "";
    if (!absPath || !fs.existsSync(absPath)) {
      return {
        ok: false,
        error: String(stderr ?? "").trim() || "PDF を解決できませんでした。",
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      };
    }
    return { ok: true, absPath, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    return {
      ok: false,
      error: String(err.stderr ?? "").trim() || err.message || "PDF の解決に失敗しました。",
      stdout: err.stdout ? String(err.stdout) : undefined,
      stderr: err.stderr ? String(err.stderr) : undefined,
    };
  }
}
