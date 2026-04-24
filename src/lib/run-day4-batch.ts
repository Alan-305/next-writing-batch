import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type RunDay4Input = {
  taskId: string;
  workers?: number;
  /** 指定時はその受付IDだけ処理（run_day4_tts_qr_pdf.py --submission-ids） */
  submissionIds?: string[];
  force?: boolean;
};

export type RunDay4Result =
  | { ok: true; stdout: string; stderr: string; durationMs: number }
  | { ok: false; error: string; stdout?: string; stderr?: string };

const MAX_BUFFER = 24 * 1024 * 1024;
const TIMEOUT_MS = 16 * 60 * 1000;

/**
 * GCS 未設定のローカル開発では Day4 に --allow-local-qr を付ける（相対 URL の QR）。
 * 本番（NODE_ENV=production）で GCS が無い場合は付けず、設定ミスとして失敗させる。
 * 明示: DAY4_ALLOW_LOCAL_QR=true / false
 */
function shouldAllowLocalQrForDay4(): boolean {
  const expl = (process.env.DAY4_ALLOW_LOCAL_QR ?? "").trim().toLowerCase();
  if (expl === "false" || expl === "0") return false;
  if (expl === "true" || expl === "1") return true;
  const gcs = (process.env.GCS_BUCKET_NAME ?? "").trim();
  if (gcs) return false;
  return process.env.NODE_ENV !== "production";
}

export function resolveDay4Python(): string | null {
  const env = (process.env.PROOFREAD_PYTHON ?? "").trim();
  if (env && fs.existsSync(env)) return env;
  const root = process.cwd();
  const unix = path.join(root, ".venv", "bin", "python3");
  const win = path.join(root, ".venv", "Scripts", "python.exe");
  if (fs.existsSync(unix)) return unix;
  if (fs.existsSync(win)) return win;
  return null;
}

export function day4ScriptPath(): string {
  return path.join(process.cwd(), "batch", "run_day4_tts_qr_pdf.py");
}

export async function runDay4Batch(input: RunDay4Input): Promise<RunDay4Result> {
  const taskId = (input.taskId ?? "").trim();
  const submissionIds = (input.submissionIds ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (!taskId && submissionIds.length === 0) {
    return { ok: false, error: "課題ID（taskId）または submissionIds のどちらかが必要です。" };
  }

  const workers = Math.min(16, Math.max(1, Math.floor(Number(input.workers) || 2)));

  const script = day4ScriptPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: `バッチが見つかりません: ${script}` };
  }

  const python = resolveDay4Python();
  if (!python) {
    return {
      ok: false,
      error:
        "Python が見つかりません。next-writing-batch で .venv を作成するか、環境変数 PROOFREAD_PYTHON に python のパスを設定してください。",
    };
  }

  const args = [script, "--task-id", taskId, "--workers", String(workers)];
  if (input.force) {
    args.push("--force");
  }
  if (submissionIds.length > 0) {
    args.push("--submission-ids", submissionIds.join(","));
  }
  if (shouldAllowLocalQrForDay4()) {
    args.push("--allow-local-qr");
  }

  const t0 = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(python, args, {
      cwd: process.cwd(),
      env: { ...process.env },
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
      error: err.message ?? "Day4 バッチの実行に失敗しました。",
      stdout: err.stdout ? String(err.stdout) : undefined,
      stderr: err.stderr ? String(err.stderr) : undefined,
    };
  }
}
