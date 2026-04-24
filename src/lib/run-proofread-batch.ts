import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { resolveEffectiveGeminiApiKey } from "@/lib/gemini-key-store";

const execFileAsync = promisify(execFile);

export type RunProofreadInput = {
  taskId: string;
  workers?: number;
  limit?: number;
  retryFailed?: boolean;
  /** 指定時はその受付IDだけ処理（run_day3_proofread.py --submission-ids） */
  submissionIds?: string[];
};

export type RunProofreadResult =
  | { ok: true; stdout: string; stderr: string; durationMs: number }
  | { ok: false; error: string; stdout?: string; stderr?: string };

const MAX_BUFFER = 24 * 1024 * 1024;
const TIMEOUT_MS = 14 * 60 * 1000;

/** 他バッチ（ZIP など）でも共有 */
export function resolveProofreadPython(): string | null {
  const env = (process.env.PROOFREAD_PYTHON ?? "").trim();
  if (env && fs.existsSync(env)) return env;
  const root = process.cwd();
  const unix = path.join(root, ".venv", "bin", "python3");
  const win = path.join(root, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

export function proofreadScriptPath(): string {
  return path.join(process.cwd(), "batch", "run_day3_proofread.py");
}

export async function runProofreadBatch(input: RunProofreadInput): Promise<RunProofreadResult> {
  const taskId = (input.taskId ?? "").trim();
  const submissionIds = (input.submissionIds ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (!taskId && submissionIds.length === 0) {
    return { ok: false, error: "課題ID（taskId）または submissionIds のどちらかが必要です。" };
  }

  const workers = Math.min(16, Math.max(1, Math.floor(Number(input.workers) || 2)));
  const limitRaw = input.limit;
  const limit =
    limitRaw === undefined || limitRaw === null || Number.isNaN(Number(limitRaw))
      ? 0
      : Math.min(500, Math.max(0, Math.floor(Number(limitRaw))));

  const script = proofreadScriptPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: `バッチが見つかりません: ${script}` };
  }

  const python = resolveProofreadPython();
  if (!python) {
    return {
      ok: false,
      error:
        "Python が見つかりません。next-writing-batch で .venv を作成するか、環境変数 PROOFREAD_PYTHON に python のパスを設定してください。",
    };
  }

  const args = [script, "--task-id", taskId, "--workers", String(workers)];
  if (limit > 0) {
    args.push("--limit", String(limit));
  }
  if (input.retryFailed) {
    args.push("--retry-failed");
  }
  if (submissionIds.length > 0) {
    args.push("--submission-ids", submissionIds.join(","));
  }

  const key = resolveEffectiveGeminiApiKey();
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (key) {
    if (!(childEnv.GEMINI_API_KEY ?? "").trim()) childEnv.GEMINI_API_KEY = key;
    if (!(childEnv.GOOGLE_API_KEY ?? "").trim()) childEnv.GOOGLE_API_KEY = key;
  }

  const t0 = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(python, args, {
      cwd: process.cwd(),
      env: childEnv,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    return {
      ok: true,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      durationMs: Date.now() - t0,
    };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string; code?: string };
    return {
      ok: false,
      error: err.message ?? "添削バッチの実行に失敗しました。",
      stdout: err.stdout ? String(err.stdout) : undefined,
      stderr: err.stderr ? String(err.stderr) : undefined,
    };
  }
}
