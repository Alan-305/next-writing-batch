import path from "path";

import { writeJsonFileAtomic } from "@/lib/atomic-json-file";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { organizationTaskProblemsDir } from "@/lib/org-data-layout";
import { parseTaskProblemsMaster, type TaskProblemsMaster } from "@/lib/task-problems-core";

function taskProblemsMirrorFilePath(organizationId: string, taskId: string): string {
  const safe = (taskId ?? "").replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return path.join(organizationTaskProblemsDir(organizationId), `${safe}.json`);
}

function col(organizationId: string) {
  return getAdminFirestore().collection("organizations").doc(organizationId).collection("taskProblems");
}

export async function loadTaskProblemsMasterFromFirestore(
  organizationId: string,
  taskId: string,
): Promise<TaskProblemsMaster | null> {
  const tid = (taskId ?? "").trim();
  if (!tid) return null;
  const snap = await col(organizationId).doc(tid).get();
  if (!snap.exists) return null;
  const raw = snap.get("master") ?? snap.data();
  return parseTaskProblemsMaster(raw as unknown);
}

export async function listTaskProblemsMastersFromFirestore(
  organizationId: string,
): Promise<TaskProblemsMaster[]> {
  const snap = await col(organizationId).get();
  const out: TaskProblemsMaster[] = [];
  for (const doc of snap.docs) {
    const raw = doc.get("master") ?? doc.data();
    const parsed = parseTaskProblemsMaster(raw as unknown);
    if (parsed) out.push(parsed);
  }
  out.sort((a, b) => a.taskId.localeCompare(b.taskId, "ja"));
  return out;
}

export async function upsertTaskProblemsMasterToFirestore(
  organizationId: string,
  masterPayload: Record<string, unknown>,
): Promise<void> {
  const parsed = parseTaskProblemsMaster(masterPayload);
  if (!parsed) throw new Error("task problems master is invalid");
  await col(organizationId).doc(parsed.taskId).set(
    {
      taskId: parsed.taskId,
      master: masterPayload,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

export async function deleteTaskProblemsMasterFromFirestore(
  organizationId: string,
  taskId: string,
): Promise<boolean> {
  const tid = (taskId ?? "").trim();
  if (!tid) return false;
  const ref = col(organizationId).doc(tid);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

/**
 * Day3/Day4 バッチは `data/orgs/{org}/task-problems/{taskId}.json` のみ参照する。
 * Cloud Run でインスタンス間にディスクが共有されないため、バッチ実行直前に Firestore 正から同期する。
 */
export async function syncTaskProblemsFileMirrorFromFirestore(
  organizationId: string,
): Promise<number> {
  const orgId = (organizationId ?? "").trim();
  if (!orgId) return 0;
  const snap = await col(orgId).get();
  let written = 0;
  for (const doc of snap.docs) {
    const master = doc.get("master") as unknown;
    if (
      master === undefined ||
      master === null ||
      typeof master !== "object" ||
      Array.isArray(master)
    ) {
      continue;
    }
    const tid = String(doc.get("taskId") ?? doc.id ?? "").trim();
    if (!tid) continue;
    await writeJsonFileAtomic(taskProblemsMirrorFilePath(orgId, tid), master);
    written++;
  }
  return written;
}
