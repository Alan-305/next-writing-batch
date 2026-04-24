import { promises as fs } from "fs";
import path from "path";

const ZIPS_DIR = path.join(process.cwd(), "output", "zips");

/** ZIP ファイル名のみ許可（パス traversal 防止） */
export function isSafeDeliverableZipName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.zip$/.test(name);
}

export type DeliverableZipRow = {
  name: string;
  size: number;
  mtimeMs: number;
  /**
   * 課題単位 ZIP（`{taskId}.zip`）のとき、ファイル名から読み取った課題ID。
   * `selection_*.zip` の個別選択 ZIP は null（一覧では「個別選択」と表示）。
   */
  taskIdFromName: string | null;
};

/**
 * 納品 ZIP ファイル名から、一覧用の課題ID表示を推定する。
 */
export function taskIdFromDeliverableZipName(name: string): string | null {
  if (!isSafeDeliverableZipName(name) || !name.endsWith(".zip")) return null;
  const stem = name.slice(0, -4);
  if (stem.startsWith("selection_")) return null;
  return stem;
}

export async function listDeliverableZips(): Promise<DeliverableZipRow[]> {
  try {
    await fs.access(ZIPS_DIR);
  } catch {
    return [];
  }
  const names = await fs.readdir(ZIPS_DIR);
  const out: DeliverableZipRow[] = [];
  for (const name of names) {
    if (!name.endsWith(".zip") || !isSafeDeliverableZipName(name)) continue;
    const full = path.join(ZIPS_DIR, name);
    const st = await fs.stat(full);
    if (!st.isFile()) continue;
    out.push({
      name,
      size: st.size,
      mtimeMs: st.mtimeMs,
      taskIdFromName: taskIdFromDeliverableZipName(name),
    });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function deliverableZipAbsolutePath(name: string): string | null {
  if (!isSafeDeliverableZipName(name)) return null;
  return path.join(ZIPS_DIR, name);
}

/** 納品ZIPを1件削除。`invalid` はファイル名が許可パターン外。 */
export async function deleteDeliverableZip(
  name: string
): Promise<"deleted" | "not_found" | "invalid"> {
  if (!isSafeDeliverableZipName(name)) return "invalid";
  const abs = deliverableZipAbsolutePath(name);
  if (!abs) return "invalid";
  try {
    await fs.unlink(abs);
    return "deleted";
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return "not_found";
    throw e;
  }
}
