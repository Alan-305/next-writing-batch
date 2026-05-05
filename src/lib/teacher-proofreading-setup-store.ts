import { promises as fs } from "fs";
import path from "path";

import { organizationTeacherSetupDir } from "@/lib/org-data-layout";
import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import {
  sanitizeProofreadingSetup,
  type ProofreadingSetupJson,
} from "@/lib/proofreading-setup-json";

/** 運用が「サーバーに保存」した JSON の絶対パス（表示・ログ用） */
export function teacherProofreadingSetupFilePath(organizationId: string, taskId: string): string {
  const tid = taskId.trim();
  const safe = tid.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return path.join(organizationTeacherSetupDir(organizationId), `${safe}.json`);
}

export async function loadTeacherProofreadingSetup(
  organizationId: string,
  taskId: string,
): Promise<ProofreadingSetupJson | null> {
  const tid = taskId.trim();
  if (!tid) return null;
  try {
    const buf = await fs.readFile(teacherProofreadingSetupFilePath(organizationId, tid), "utf8");
    return sanitizeProofreadingSetup(JSON.parse(buf) as unknown);
  } catch {
    return null;
  }
}

export async function saveTeacherProofreadingSetup(
  organizationId: string,
  payload: ProofreadingSetupJson,
): Promise<void> {
  const tid = payload.task_id.trim();
  if (!tid) {
    throw new Error("task_id is required");
  }
  const setup = sanitizeProofreadingSetup(payload);
  const fp = teacherProofreadingSetupFilePath(organizationId, tid);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await writeJsonFileAtomic(fp, setup);
}

/** サーバー保存済みの教員添削設定 JSON を削除する。ファイルが無ければ false。 */
export async function deleteTeacherProofreadingSetup(organizationId: string, taskId: string): Promise<boolean> {
  const tid = taskId.trim();
  if (!tid) return false;
  try {
    await fs.unlink(teacherProofreadingSetupFilePath(organizationId, tid));
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return false;
    throw e;
  }
}
