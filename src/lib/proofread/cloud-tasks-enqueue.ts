import { CloudTasksClient } from "@google-cloud/tasks";

import { proofreadWorkerAuthHeader } from "@/lib/proofread/verify-worker-auth";

function gcpProjectId(): string {
  return (
    (process.env.GCP_PROJECT_ID ?? "").trim() ||
    (process.env.NWB_GCP_PROJECT_ID ?? "").trim() ||
    (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim()
  );
}

export function isCloudTasksProofreadConfigured(): boolean {
  return Boolean(
    gcpProjectId() &&
      (process.env.NWB_CLOUD_TASKS_QUEUE ?? "").trim() &&
      (process.env.NWB_PROOFREAD_WORKER_URL ?? "").trim() &&
      (process.env.NWB_PROOFREAD_WORKER_SECRET ?? "").trim(),
  );
}

export function shouldProcessProofreadInline(): boolean {
  return (process.env.NWB_PROOFREAD_INLINE ?? "").trim() === "true";
}

export async function dispatchProofreadCloudTask(payload: {
  organizationId: string;
  submissionId: string;
  jobId: string;
}): Promise<string> {
  const projectId = gcpProjectId();
  const location = (process.env.NWB_CLOUD_TASKS_LOCATION ?? "asia-northeast1").trim();
  const queueName = (process.env.NWB_CLOUD_TASKS_QUEUE ?? "").trim();
  const workerBase = (process.env.NWB_PROOFREAD_WORKER_URL ?? "").replace(/\/$/, "");

  if (!projectId || !queueName || !workerBase) {
    throw new Error("CLOUD_TASKS_NOT_CONFIGURED");
  }

  const client = new CloudTasksClient();
  const parent = client.queuePath(projectId, location, queueName);
  const url = `${workerBase}/api/internal/process-proofread`;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64");

  const [response] = await client.createTask({
    parent,
    task: {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
          ...proofreadWorkerAuthHeader(),
        },
        body,
      },
    },
  });
  return String(response.name ?? "");
}

export async function deleteProofreadCloudTask(taskName: string): Promise<void> {
  const name = (taskName ?? "").trim();
  if (!name) return;
  const client = new CloudTasksClient();
  try {
    await client.deleteTask({ name });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // 既に実行済み・削除済みは無視
    if (/NOT_FOUND|AlreadyExists|failed precondition/i.test(msg)) return;
    throw e;
  }
}

/** ローカル開発: 自サービスへ非同期 POST（Cloud Tasks 未設定時） */
export async function dispatchProofreadInlineFetch(payload: {
  organizationId: string;
  submissionId: string;
  jobId: string;
}): Promise<void> {
  const workerBase = (
    process.env.NWB_PROOFREAD_WORKER_URL ??
    process.env.NWB_PUBLIC_APP_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const url = `${workerBase}/api/internal/process-proofread`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...proofreadWorkerAuthHeader(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`INLINE_WORKER_HTTP_${res.status}: ${text.slice(0, 500)}`);
  }
}
