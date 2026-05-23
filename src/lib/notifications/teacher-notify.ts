import { buildTenantRoster } from "@/lib/admin/tenant-roster";
import { loadUserProfileAdmin } from "@/lib/auth/load-user-profile-admin";
import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { getAdminAuth } from "@/lib/firebase/admin-app";

function resendFromAddress(): string {
  const explicit = (process.env.RESEND_FROM_EMAIL ?? process.env.RESEND_FROM ?? "").trim();
  return explicit || "Nexus Learning <onboarding@resend.dev>";
}

export function opsSubmissionsListUrl(): string | null {
  const base = (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NWB_PROOFREAD_WORKER_URL ??
    process.env.VERCEL_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (!base) return null;
  return base.startsWith("http") ? `${base}/ops/submissions` : `https://${base}/ops/submissions`;
}

export async function resolveUidEmail(uid: string): Promise<string | null> {
  const u = uid.trim();
  if (!u) return null;
  try {
    const rec = await getAdminAuth().getUser(u);
    return (rec.email ?? "").trim() || null;
  } catch {
    return null;
  }
}

export async function sendResendPlainEmail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info("[notify] RESEND_API_KEY 未設定のためスキップ", { subject });
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
    console.error("[notify] Resend error", { status: res.status, body, to, subject });
    return false;
  }
  return true;
}

/** 生徒などが新規提出したとき、テナントの教師にメール（教員本人の試行提出は除く） */
export async function notifyTeachersNewSubmission(input: {
  organizationId: string;
  submittedByUid: string;
  submissionId: string;
  taskId: string;
  studentId: string;
  studentName: string;
}): Promise<void> {
  const submitter = (input.submittedByUid ?? "").trim();
  const profile = submitter ? await loadUserProfileAdmin(submitter) : null;
  const roles = profile ? normalizeRoles(profile.roles) : [];
  if (isTeacherByRoles(roles)) {
    return;
  }

  const roster = await buildTenantRoster(input.organizationId);
  const teachers = roster.teachers.filter((t) => (t.email ?? "").trim());
  if (teachers.length === 0) {
    console.info("[notify][new-submission] 教師メールなし", { org: input.organizationId });
    return;
  }

  const listUrl = opsSubmissionsListUrl();
  const lines = [
    "新しい英作文の提出がありました（status: pending）。",
    "",
    `課題ID: ${input.taskId}`,
    `受付ID: ${input.submissionId}`,
    `学籍: ${input.studentId || "—"}`,
    `氏名: ${input.studentName || "—"}`,
    "",
    "提出一覧から「今すぐ」または「預ける」で添削を開始できます。",
  ];
  if (listUrl) lines.push("", `提出一覧: ${listUrl}`);
  lines.push("", "— 添削革命 / next-writing-batch");
  const text = lines.join("\n");
  const subject = `【添削革命】新しい提出（${input.taskId}）`;

  for (const t of teachers) {
    const email = (t.email ?? "").trim();
    if (!email) continue;
    await sendResendPlainEmail(email, subject, text);
    console.info("[notify][new-submission] sent", { to: email, submissionId: input.submissionId });
  }
}

/** 「預ける」受付直後、預けた教師本人にメール */
export async function notifyProofreadEnqueueReceipt(input: {
  requestedByUid: string;
  enqueuedCount: number;
  batchId: string;
}): Promise<void> {
  const uid = (input.requestedByUid ?? "").trim();
  const count = input.enqueuedCount;
  if (!uid || count <= 0) return;

  const email = await resolveUidEmail(uid);
  if (!email) {
    console.info("[notify][enqueue-receipt] email なし", { uid });
    return;
  }

  const listUrl = opsSubmissionsListUrl();
  const lines = [
    `添削依頼を ${count} 件お預かりしました。`,
    "",
    "空き時間に順次処理します。",
    "· すべて完了したらメールでお知らせします",
    "· 長時間かかる場合は約1時間ごとに途中経過も送ります",
    "",
    "ブラウザは閉じて大丈夫です。",
  ];
  if (listUrl) lines.push("", `提出一覧: ${listUrl}`);
  lines.push("", "— 添削革命 / next-writing-batch");

  await sendResendPlainEmail(
    email,
    `【添削革命】添削 ${count} 件を受付しました`,
    lines.join("\n"),
  );
  console.info("[notify][enqueue-receipt] sent", { to: email, count, batchId: input.batchId });
}
