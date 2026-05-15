import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { resolveEffectiveAnthropicApiKey } from "@/lib/anthropic-key-store";

const execFileAsync = promisify(execFile);

export type RunProofreadInput = {
  /** テナント（Python は `NWB_ORGANIZATION_ID` で受け取る） */
  organizationId: string;
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
  const organizationId = (input.organizationId ?? "").trim();
  const taskId = (input.taskId ?? "").trim();
  const submissionIds = (input.submissionIds ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (!taskId && submissionIds.length === 0) {
    return { ok: false, error: "課題ID（taskId）または submissionIds のどちらかが必要です。" };
  }

  // 内容指摘の途中切れ抑止のため、並列実行は無効化して常に 1 件ずつ処理する。
  // input.workers が渡されても無視する（UI からは並列数選択を撤去済み）。
  const workers = 1;
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

  const key = resolveEffectiveAnthropicApiKey();
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (organizationId) {
    childEnv.NWB_ORGANIZATION_ID = organizationId;
  }
  if (key) {
    if (!(childEnv.NEXT_WRITING_BATCH_KEY ?? "").trim()) childEnv.NEXT_WRITING_BATCH_KEY = key;
  }

  const t0 = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(python, args, {
      cwd: process.cwd(),
      env: childEnv,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    const stdoutStr = String(stdout ?? "");
    const stderrStr = String(stderr ?? "");
    // Python の診断ログ（[claude-call] 等）を Cloud Run のログにも流す。
    if (stderrStr.trim()) {
      console.error(`[run-proofread-batch][stderr]\n${stderrStr}`);
    }
    if (stdoutStr.trim()) {
      console.log(`[run-proofread-batch][stdout]\n${stdoutStr}`);
    }
    return {
      ok: true,
      stdout: stdoutStr,
      stderr: stderrStr,
      durationMs: Date.now() - t0,
    };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string; code?: string };
    const stdoutStr = err.stdout ? String(err.stdout) : undefined;
    const stderrStr = err.stderr ? String(err.stderr) : undefined;
    if (stderrStr?.trim()) {
      console.error(`[run-proofread-batch][stderr][failed]\n${stderrStr}`);
    }
    if (stdoutStr?.trim()) {
      console.log(`[run-proofread-batch][stdout][failed]\n${stdoutStr}`);
    }
    return {
      ok: false,
      error: err.message ?? "添削バッチの実行に失敗しました。",
      stdout: stdoutStr,
      stderr: stderrStr,
    };
  }
}
