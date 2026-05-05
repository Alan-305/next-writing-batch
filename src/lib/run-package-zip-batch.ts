import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { resolveProofreadPython } from "@/lib/run-proofread-batch";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 24 * 1024 * 1024;
const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SELECTION_IDS = 200;

export type PackageZipInput =
  | { organizationId: string; mode: "task"; taskId: string }
  | { organizationId: string; mode: "selection"; submissionIds: string[] };

export type PackageZipResult =
  | { ok: true; stdout: string; stderr: string; durationMs: number }
  | { ok: false; error: string; stdout?: string; stderr?: string };

function packageZipScriptPath(): string {
  return path.join(process.cwd(), "batch", "package_zip_selection.py");
}

export async function runPackageZipSelection(input: PackageZipInput): Promise<PackageZipResult> {
  const script = packageZipScriptPath();
  if (!fs.existsSync(script)) {
    return { ok: false, error: `スクリプトが見つかりません: ${script}` };
  }

  const python = resolveProofreadPython();
  if (!python) {
    return {
      ok: false,
      error:
        "Python が見つかりません。next-writing-batch で .venv を作成するか、環境変数 PROOFREAD_PYTHON に python のパスを設定してください。",
    };
  }

  let args: string[];
  if (input.mode === "task") {
    const tid = input.taskId.trim();
    if (!tid) {
      return { ok: false, error: "課題IDを指定してください。" };
    }
    args = [script, "--by-task", tid];
  } else {
    const ids = [...new Set(input.submissionIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
    if (ids.length === 0) {
      return { ok: false, error: "提出を1件以上選択してください。" };
    }
    if (ids.length > MAX_SELECTION_IDS) {
      return { ok: false, error: `一度に ZIP できるのは最大 ${MAX_SELECTION_IDS} 件です。` };
    }
    args = [script, "--by-submissions", ids.join(",")];
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
    return {
      ok: true,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
      durationMs: Date.now() - t0,
    };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    return {
      ok: false,
      error: err.message ?? "ZIP の作成に失敗しました。",
      stdout: err.stdout ? String(err.stdout) : undefined,
      stderr: err.stderr ? String(err.stderr) : undefined,
    };
  }
}
