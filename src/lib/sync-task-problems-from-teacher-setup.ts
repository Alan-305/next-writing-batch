import { promises as fs } from "fs";
import path from "path";

import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import { taskProblemsFilePath } from "@/lib/load-task-problems-master";
import { migrateLegacyOrgLayoutOnce } from "@/lib/org-data-layout";
import { sanitizeProofreadingSetup, type ProofreadingSetupJson } from "@/lib/proofreading-setup-json";
import { pickQuestion, type TaskProblemsMaster } from "@/lib/task-problems-core";
import { upsertTaskProblemsMasterToFirestore } from "@/lib/task-problems-firestore";

/** 教員「サーバーに保存」と同期する課題マスタの単一設問 ID（添削バッチの解決と一致させる） */
export const TEACHER_SYNC_DEFAULT_PROBLEM_ID = "default";

/**
 * ディスク上の教員 JSON が無い／揮発した場合でも、Firestore 等の課題マスタから運用フォーム用の最小セットを復元する。
 */
export function proofreadingSetupFromTaskProblemsMaster(master: TaskProblemsMaster): ProofreadingSetupJson {
  const contentItem = master.rubric.items.find((i) => i.id === "content");
  const grammarItem = master.rubric.items.find((i) => i.id === "grammar");
  let content_max = contentItem?.max;
  let grammar_max = grammarItem?.max;
  if (content_max === undefined && grammar_max === undefined) {
    content_max = master.rubric.items[0]?.max ?? 25;
    grammar_max = master.rubric.items[1]?.max ?? 25;
  } else {
    content_max = content_max ?? 25;
    grammar_max = grammar_max ?? 25;
  }
  const fromDefault = pickQuestion(master, TEACHER_SYNC_DEFAULT_PROBLEM_ID);
  const fromAny =
    master.problems.find((p) => (p.question ?? "").trim())?.question.trim() ?? "";
  const q = (fromDefault && fromDefault.trim()) || fromAny;
  const first = master.problems[0];
  return sanitizeProofreadingSetup({
    task_id: master.taskId,
    problem_memo: (first?.title ?? "").trim(),
    teacher_name: "",
    teacher_email: "",
    school_name: "",
    grammar_max,
    content_max,
    question: q,
  });
}

export function buildTaskProblemsMasterFromTeacherSetup(setup: ProofreadingSetupJson): Record<string, unknown> {
  const taskId = setup.task_id.trim();
  const content = setup.content_max;
  const grammar = setup.grammar_max;
  const memo = (setup.problem_memo ?? "").trim();
  return {
    taskId,
    rubric: {
      maxTotal: content + grammar,
      items: [
        { id: "content", label: "内容", max: content },
        { id: "grammar", label: "文法・語法", max: grammar },
      ],
    },
    problems: [
      {
        problemId: TEACHER_SYNC_DEFAULT_PROBLEM_ID,
        title: memo || "本課題",
        question: setup.question.trim(),
      },
    ],
  };
}

/** 課題・添削設定の保存内容でテナント配下の課題マスタ JSON を上書きする（提出プルダウン・添削の単一ソース化） */
export async function syncTaskProblemsFromProofreadingSetup(
  organizationId: string,
  setup: ProofreadingSetupJson,
  meta?: { savedByUid: string; savedAt: string },
): Promise<void> {
  await migrateLegacyOrgLayoutOnce();
  const tid = setup.task_id.trim();
  if (!tid) {
    throw new Error("task_id is required");
  }
  if (!setup.question.trim()) {
    throw new Error("question is required");
  }
  const payload: Record<string, unknown> = {
    ...buildTaskProblemsMasterFromTeacherSetup(setup),
  };
  if (meta) {
    payload._meta = {
      lastSavedByUid: meta.savedByUid,
      lastSavedAt: meta.savedAt,
    };
  }
  const fp = taskProblemsFilePath(organizationId, tid);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await writeJsonFileAtomic(fp, payload);
  await upsertTaskProblemsMasterToFirestore(organizationId, payload);
}
