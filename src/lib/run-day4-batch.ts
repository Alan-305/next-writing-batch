import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type RunDay4Input = {
  organizationId: string;
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
 * Day4 に --allow-local-qr を付ける条件（GCS なしで音声 URL を HTTPS 相対 or AUDIO_BASE_URL 絶対にする）。
 * - DAY4_ALLOW_LOCAL_QR=false … 明示オフ
 * - DAY4_ALLOW_LOCAL_QR=true … 明示オン
 * - GCS_BUCKET_NAME あり … GCS 利用のため付けない
 * - AUDIO_BASE_URL あり（GCS なし）… 本番でも「公開ベース URL 運用」とみなしてオン（Cloud Run 試験運用向け）
 * - それ以外 … 非 production のみ従来どおりオン
 */
function shouldAllowLocalQrForDay4(): boolean {
  const expl = (process.env.DAY4_ALLOW_LOCAL_QR ?? "").trim().toLowerCase();
  if (expl === "false" || expl === "0") return false;
  if (expl === "true" || expl === "1") return true;
  const gcs = (process.env.GCS_BUCKET_NAME ?? "").trim();
  if (gcs) return false;
  const audioBase = (process.env.AUDIO_BASE_URL ?? "").trim();
  if (audioBase) return true;
  return process.env.NODE_ENV !== "production";
}

/** QR 生成は明示オプションのみ（既定オフ）。将来つけるときは DAY4_ENABLE_QR=true */
function shouldEnableQrForDay4(): boolean {
  const expl = (process.env.DAY4_ENABLE_QR ?? "").trim().toLowerCase();
  return expl === "true" || expl === "1";
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
  if (shouldEnableQrForDay4()) {
    args.push("--qr");
  }

  const t0 = Date.now();
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  const oid = (input.organizationId ?? "").trim();
  if (oid) {
    childEnv.NWB_ORGANIZATION_ID = oid;
  }
  try {
    const { stdout, stderr } = await execFileAsync(python, args, {
      cwd: process.cwd(),
      env: childEnv,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    const out = String(stdout ?? "");
    const err = String(stderr ?? "");
    const noTargets = /\[day4\]\s+targets=0\b/.test(`${out}\n${err}`);
    if (noTargets) {
      return {
        ok: false,
        error:
          "Day4 の対象が 0 件でした。提出が status=done か、課題ID/受付ID が一致しているか、読み上げ用英文（finalText または添削結果）があるかを確認してください。",
        stdout: out,
        stderr: err,
      };
    }
    return {
      ok: true,
      stdout: out,
      stderr: err,
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
