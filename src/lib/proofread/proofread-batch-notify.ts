import { getAdminAuth } from "@/lib/firebase/admin-app";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";
import type { ProofreadBatch, ProofreadJob, ProofreadJobStatus } from "@/lib/proofread/proofread-job-types";

const PROGRESS_EMAIL_INTERVAL_MS = 60 * 60 * 1000;

function orgProofreadBatchesCol(organizationId: string) {
  return getAdminFirestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("proofreadBatches");
}

function orgProofreadJobsCol(organizationId: string) {
  return getAdminFirestore()
    .collection("organizations")
    .doc(organizationId)
    .collection("proofreadJobs");
}

function resendFromAddress(): string {
  const explicit = (process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? "").trim();
  return explicit || "Nexus Learning <onboarding@resend.dev>";
}

function publicAppUrl(): string {
  return (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NWB_PROOFREAD_WORKER_URL ??
    process.env.VERCEL_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
}

function submissionsListUrl(): string | null {
  const base = publicAppUrl();
  if (!base) return null;
  const path = base.startsWith("http") ? `${base}/ops/submissions` : `https://${base}/ops/submissions`;
  return path;
}

async function resolveTeacherEmail(uid: string): Promise<string | null> {
  const u = uid.trim();
  if (!u) return null;
  try {
    const rec = await getAdminAuth().getUser(u);
    return (rec.email ?? "").trim() || null;
  } catch (e) {
    console.warn("[proofread-notify] getUser failed", { uid: u, e });
    return null;
  }
}

async function sendResendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[proofread-notify] RESEND_API_KEY 未設定のためスキップ");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromAddress(),
      to: [to],
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[proofread-notify] Resend error", { status: res.status, body, to, subject });
    if (res.status === 403 && body.includes("verify a domain")) {
      console.error(
        "[proofread-notify] Resend は検証用送信元 (onboarding@resend.dev) ではアカウント所有者以外に送れません。" +
          " resend.com/domains でドメインを検証し、Cloud Run に RESEND_FROM_EMAIL を設定してください。",
      );
    }
    return false;
  }
  return true;
}

type BatchCounts = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};

function countJobs(jobs: ProofreadJob[]): BatchCounts {
  const c: BatchCounts = {
    total: jobs.length,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const j of jobs) {
    const st = j.status as ProofreadJobStatus;
    if (st === "queued") c.queued += 1;
    else if (st === "running") c.running += 1;
    else if (st === "succeeded") c.succeeded += 1;
    else if (st === "failed") c.failed += 1;
    else if (st === "cancelled") c.cancelled += 1;
  }
  return c;
}

function isBatchTerminal(c: BatchCounts): boolean {
  return c.queued + c.running === 0;
}

function buildProgressBody(c: BatchCounts, listUrl: string | null): string {
  const done = c.succeeded + c.failed + c.cancelled;
  const remain = c.queued + c.running;
  const lines = [
    "添削キューの途中経過をお知らせします。",
    "",
    `進捗: ${done} / ${c.total} 件処理済み（done ${c.succeeded} · failed ${c.failed} · 中止 ${c.cancelled}）`,
    `残り: queued ${c.queued} · processing ${c.running}（合計 ${remain} 件）`,
    "",
    "完了までしばらくお待ちください。空き時間に順次処理されます。",
  ];
  if (listUrl) {
    lines.push("", `提出一覧: ${listUrl}`);
  }
  lines.push("", "— 添削革命 / next-writing-batch");
  return lines.join("\n");
}

function buildCompletionBody(c: BatchCounts, listUrl: string | null): string {
  const lines = [
    "預けていた添削がすべて完了しました。",
    "",
    `結果: 合計 ${c.total} 件`,
    `  · done（成功）: ${c.succeeded} 件`,
    `  · failed: ${c.failed} 件`,
    `  · 中止: ${c.cancelled} 件`,
    "",
    "提出一覧で内容をご確認ください。",
  ];
  if (listUrl) {
    lines.push("", `提出一覧: ${listUrl}`);
  }
  lines.push("", "— 添削革命 / next-writing-batch");
  return lines.join("\n");
}

async function loadBatchJobs(organizationId: string, batch: ProofreadBatch): Promise<ProofreadJob[]> {
  const jobs: ProofreadJob[] = [];
  for (const jobId of batch.jobIds ?? []) {
    const snap = await orgProofreadJobsCol(organizationId).doc(jobId).get();
    if (snap.exists) jobs.push(snap.data() as ProofreadJob);
  }
  return jobs;
}

/**
 * 預け型バッチの完了 / 途中経過メール（預けた教師 uid のみ）。
 * 完了メールは全ジョブ終了時に1通。途中経過は原則1時間に1通まで。
 */
export async function maybeNotifyProofreadBatch(organizationId: string, batchId: string): Promise<void> {
  const oid = (organizationId ?? "").trim();
  const bid = (batchId ?? "").trim();
  if (!oid || !bid) return;

  const batchRef = orgProofreadBatchesCol(oid).doc(bid);
  const batchSnap = await batchRef.get();
  if (!batchSnap.exists) return;
  const batch = batchSnap.data() as ProofreadBatch;
  const requestedByUid = (batch.requestedByUid ?? "").trim();
  if (!requestedByUid) return;

  const jobs = await loadBatchJobs(oid, batch);
  if (jobs.length === 0) return;

  const counts = countJobs(jobs);
  const terminal = isBatchTerminal(counts);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  type NotifyKind = "completion" | "progress" | null;
  let kind: NotifyKind = null;

  await getAdminFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(batchRef);
    if (!snap.exists) return;
    const data = snap.data() as ProofreadBatch;

    if (terminal) {
      // 成功送信済みのみスキップ。旧実装で completionEmailSentAt だけ付いた失敗分は再送する。
      if (data.completionEmailDeliveredAt) return;
      kind = "completion";
      return;
    }

    const createdMs = Date.parse(data.createdAt ?? "");
    const batchAgeOk = Number.isFinite(createdMs) && now - createdMs >= PROGRESS_EMAIL_INTERVAL_MS;
    const lastRaw = (data.lastProgressEmailAt ?? "").trim();
    const lastMs = lastRaw ? Date.parse(lastRaw) : 0;
    const sinceLastOk =
      !lastRaw || (Number.isFinite(lastMs) && now - lastMs >= PROGRESS_EMAIL_INTERVAL_MS);
    if (!batchAgeOk || !sinceLastOk) return;

    kind = "progress";
  });

  if (!kind) return;

  const email = await resolveTeacherEmail(requestedByUid);
  if (!email) {
    console.warn("[proofread-notify] no email for uid", { requestedByUid, batchId: bid });
    return;
  }

  const listUrl = submissionsListUrl();
  if (kind === "completion") {
    const sent = await sendResendEmail(
      email,
      `【添削革命】添削が完了しました（${counts.total}件）`,
      buildCompletionBody(counts, listUrl),
    );
    if (sent) {
      await batchRef.set(
        { completionEmailSentAt: nowIso, completionEmailDeliveredAt: nowIso },
        { merge: true },
      );
      console.info("[proofread-notify] completion sent", { batchId: bid, to: email, counts });
    } else {
      console.warn("[proofread-notify] completion not delivered (will retry on next job finish)", {
        batchId: bid,
        to: email,
        counts,
      });
    }
  } else {
    const sent = await sendResendEmail(
      email,
      `【添削革命】添削の途中経過（${counts.succeeded + counts.failed + counts.cancelled}/${counts.total}件）`,
      buildProgressBody(counts, listUrl),
    );
    if (sent) {
      await batchRef.set({ lastProgressEmailAt: nowIso }, { merge: true });
      console.info("[proofread-notify] progress sent", { batchId: bid, to: email, counts });
    } else {
      console.warn("[proofread-notify] progress not delivered", { batchId: bid, to: email, counts });
    }
  }
}

export async function createProofreadBatchDoc(batch: ProofreadBatch): Promise<void> {
  await orgProofreadBatchesCol(batch.organizationId).doc(batch.batchId).set(batch);
}
