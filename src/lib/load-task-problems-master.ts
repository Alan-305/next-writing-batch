import { promises as fs } from "fs";
import path from "path";
import { unstable_noStore as noStore } from "next/cache";

import { parseTaskProblemsMaster, type TaskProblemsMaster } from "@/lib/task-problems-core";

export function taskProblemsFilePath(taskId: string): string {
  const safe = taskId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return path.join(process.cwd(), "data", "task-problems", `${safe}.json`);
}

export async function loadTaskProblemsMaster(taskId: string): Promise<TaskProblemsMaster | null> {
  noStore();
  const tid = taskId.trim();
  if (!tid) return null;
  try {
    const buf = await fs.readFile(taskProblemsFilePath(tid), "utf8");
    return parseTaskProblemsMaster(JSON.parse(buf) as unknown);
  } catch {
    return null;
  }
}

/** 課題マスタ JSON を削除する。ファイルが無ければ false。 */
export async function deleteTaskProblemsMasterFile(taskId: string): Promise<boolean> {
  const tid = taskId.trim();
  if (!tid) return false;
  try {
    await fs.unlink(taskProblemsFilePath(tid));
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return false;
    throw e;
  }
}
