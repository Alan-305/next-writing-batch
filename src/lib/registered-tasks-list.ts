import { promises as fs } from "fs";
import path from "path";

import { organizationTaskProblemsDir } from "@/lib/org-data-layout";
import { listTaskProblemsMastersFromFirestore, upsertTaskProblemsMasterToFirestore } from "@/lib/task-problems-firestore";
import { parseTaskProblemsMaster } from "@/lib/task-problems-core";
import { loadTeacherProofreadingSetup } from "@/lib/teacher-proofreading-setup-store";

export type RegisteredProblemOption = {
  problemId: string;
  title: string;
};

export type RegisteredTaskSummary = {
  taskId: string;
  /** プルダウン表示用（教員設定の学校名・問題メモ → 先頭設問タイトル → taskId の優先） */
  displayLabel: string;
  problems: RegisteredProblemOption[];
};

/**
 * `data/orgs/{organizationId}/task-problems/*.json` から登録済み課題一覧を構築する。
 * 同一 taskId が複数ファイルに存在する場合は先勝ち。
 */
export async function listRegisteredTasks(organizationId: string): Promise<RegisteredTaskSummary[]> {
  const fsMasters = await listTaskProblemsMastersFromFirestore(organizationId);
  if (fsMasters.length > 0) {
    const rows = fsMasters.map((master) => {
      const first = master.problems[0];
      const displayLabel = (first?.title || "").trim() || master.taskId;
      return {
        taskId: master.taskId,
        displayLabel,
        problems: master.problems.map((p) => ({
          problemId: p.problemId,
          title: (p.title || "").trim() || p.problemId,
        })),
      } satisfies RegisteredTaskSummary;
    });
    await Promise.all(
      rows.map(async (row) => {
        const teacher = await loadTeacherProofreadingSetup(organizationId, row.taskId);
        if (!teacher) return;
        const parts = [teacher.school_name?.trim(), teacher.problem_memo?.trim()].filter(Boolean);
        if (parts.length > 0) row.displayLabel = parts.join(" · ");
      }),
    );
    return rows.sort((a, b) => a.taskId.localeCompare(b.taskId, "ja"));
  }

  const dir = organizationTaskProblemsDir(organizationId);
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }

  const byTaskId = new Map<string, RegisteredTaskSummary>();

  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const fp = path.join(dir, name);
    try {
      const buf = await fs.readFile(fp, "utf8");
      const master = parseTaskProblemsMaster(JSON.parse(buf) as unknown);
      if (!master) continue;
      // 旧ファイルのみ運用から Firestore 正本へ自己修復する。
      try {
        await upsertTaskProblemsMasterToFirestore(organizationId, master as unknown as Record<string, unknown>);
      } catch {
        /* ignore sync errors on read path */
      }
      const tid = master.taskId.trim();
      if (!tid || byTaskId.has(tid)) continue;
      const first = master.problems[0];
      const displayLabel = (first?.title || "").trim() || tid;
      byTaskId.set(tid, {
        taskId: tid,
        displayLabel,
        problems: master.problems.map((p) => ({
          problemId: p.problemId,
          title: (p.title || "").trim() || p.problemId,
        })),
      });
    } catch {
      continue;
    }
  }

  const rows = [...byTaskId.values()].sort((a, b) => a.taskId.localeCompare(b.taskId, "ja"));

  await Promise.all(
    rows.map(async (row) => {
      const teacher = await loadTeacherProofreadingSetup(organizationId, row.taskId);
      if (!teacher) return;
      const parts = [teacher.school_name?.trim(), teacher.problem_memo?.trim()].filter(Boolean);
      if (parts.length > 0) {
        row.displayLabel = parts.join(" · ");
      }
    }),
  );

  return rows;
}
