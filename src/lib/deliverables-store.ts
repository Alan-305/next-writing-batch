import { promises as fs } from "fs";
import path from "path";

function zipsDir(): string {
  const outRoot = (process.env.NWB_OUTPUT_ROOT ?? "").trim();
  const base = outRoot || path.join(process.cwd(), "output");
  return path.join(base, "zips");
}

/** ZIP ファイル名のみ許可（パス traversal 防止）。`*.pdf.zip` も可。 */
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
   * ファイル名から推定した課題ID（例: `2026-4_111-222_2件_...pdf.zip` → `2026-4`）。
   * 複数課題や旧形式は null。
   */
  taskIdFromName: string | null;
};

/**
 * 納品 ZIP ファイル名から、一覧用の課題ID表示を推定する。
 */
export function taskIdFromDeliverableZipName(name: string): string | null {
  if (!isSafeDeliverableZipName(name) || !name.endsWith(".zip")) return null;
  const stem = name.slice(0, -4).replace(/\.pdf$/i, "");
  if (!stem || stem.startsWith("selection_")) return null;
  const first = stem.split("_")[0]?.trim() ?? "";
  if (!first || first === "tasks" || first.startsWith("tasks-") || first === "no-task") {
    return null;
  }
  return first;
}

export async function listDeliverableZips(): Promise<DeliverableZipRow[]> {
  try {
    await fs.access(zipsDir());
  } catch {
    return [];
  }
  const names = await fs.readdir(zipsDir());
  const out: DeliverableZipRow[] = [];
  for (const name of names) {
    if (!name.endsWith(".zip") || !isSafeDeliverableZipName(name)) continue;
    const full = path.join(zipsDir(), name);
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
  return path.join(zipsDir(), name);
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
