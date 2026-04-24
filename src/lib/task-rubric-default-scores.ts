import { promises as fs } from "fs";
import path from "path";

import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import type { TaskProblemsMaster } from "@/lib/task-problems-core";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "task-rubric-default-scores.json");

type FileShape = Record<string, Record<string, number>>;

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** 課題（taskId）ごとのルーブリック初期点（運用が最後に保存した値） */
export async function loadTaskRubricDefaultScores(taskId: string): Promise<Record<string, number>> {
  const tid = taskId.trim();
  if (!tid) return {};
  try {
    const raw = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const row = (raw as FileShape)[tid];
    if (!row || typeof row !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(row)) {
      const key = k.trim();
      if (!key) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function clampScoresToMaster(
  master: TaskProblemsMaster,
  scores: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of master.rubric.items) {
    let v = scores[it.id];
    if (typeof v !== "number" || Number.isNaN(v)) v = 0;
    if (v < 0) v = 0;
    if (v > it.max) v = it.max;
    out[it.id] = v;
  }
  return out;
}

/** 提出保存時に呼び、同じ taskId の次回以降の初期点にする */
export async function persistTaskRubricDefaultScores(
  taskId: string,
  master: TaskProblemsMaster,
  scores: Record<string, number>,
): Promise<void> {
  const tid = taskId.trim();
  if (!tid) return;

  const clamped = clampScoresToMaster(master, scores);

  await ensureDataDir();
  let all: FileShape = {};
  try {
    const raw = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as unknown;
    if (raw && typeof raw === "object") all = raw as FileShape;
  } catch {
    /* ファイルなし */
  }
  all[tid] = clamped;
  await writeJsonFileAtomic(DATA_FILE, all);
}
