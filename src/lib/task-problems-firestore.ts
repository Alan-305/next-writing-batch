import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import { parseTaskProblemsMaster, type TaskProblemsMaster } from "@/lib/task-problems-core";

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
