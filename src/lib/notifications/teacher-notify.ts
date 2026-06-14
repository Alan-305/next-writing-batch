import { buildTenantRoster } from "@/lib/admin/tenant-roster";
import { loadUserProfileAdmin } from "@/lib/auth/load-user-profile-admin";
import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { parseAdminUidAllowlist } from "@/lib/firebase/admin-allowlist";
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

async function resolveAdminNotifyEmails(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const email = raw.trim();
    if (!email.includes("@")) return;
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(email);
  };

  push(process.env.SUPPORT_NOTIFY_EMAIL ?? "");
  for (const uid of parseAdminUidAllowlist()) {
    const email = await resolveUidEmail(uid);
    if (email) push(email);
  }
  return out;
}

/** 教員の新規登録（テナント作成・初回 teacher ロール付与）時に管理者へ通知 */
export async function notifyAdminNewTeacherRegistration(input: {
  uid: string;
  organizationId: string;
  createdNewTenant: boolean;
}): Promise<void> {
  const uid = (input.uid ?? "").trim();
  const organizationId = (input.organizationId ?? "").trim();
  if (!uid || !organizationId) return;

  const recipients = await resolveAdminNotifyEmails();
  if (recipients.length === 0) {
    console.info("[notify][teacher-register] 管理者メール先なし", { uid, organizationId });
    return;
  }

  const teacherEmail = (await resolveUidEmail(uid)) ?? "—";
  let displayName = "";
  try {
    const rec = await getAdminAuth().getUser(uid);
    displayName = (rec.displayName ?? "").trim();
  } catch {
    /* ignore */
  }

  const adminUrlBase = (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NWB_PROOFREAD_WORKER_URL ??
    process.env.VERCEL_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
  const adminHref = adminUrlBase
    ? adminUrlBase.startsWith("http")
      ? `${adminUrlBase}/admin`
      : `https://${adminUrlBase}/admin`
    : null;

  const lines = [
    "教員の新規登録がありました。",
    "",
    `UID: ${uid}`,
    `メール: ${teacherEmail}`,
    ...(displayName ? [`表示名: ${displayName}`] : []),
    `テナント ID: ${organizationId}`,
    `種別: ${input.createdNewTenant ? "新規テナント作成" : "既存テナントへの参加"}`,
    "",
    "初回登録特典として、有効期限30日のチケット 5 枚が付与されています。",
  ];
  if (adminHref) lines.push("", `管理画面: ${adminHref}`);
  lines.push("", "— 添削革命 / next-writing-batch");

  const subject = `【添削革命】教員の新規登録（${organizationId}）`;
  const text = lines.join("\n");

  for (const to of recipients) {
    await sendResendPlainEmail(to, subject, text);
    console.info("[notify][teacher-register] sent", { to, uid, organizationId });
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
    if (res.status === 403 && body.includes("verify a domain")) {
      console.error(
        "[notify] RESEND_FROM_EMAIL が未設定または検証用送信元です。Cloud Run / Functions に検証済みドメインを設定してください。",
      );
    }
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

/** 生徒が公開済み添削の受け取り方法（Web確認 / 講師面談）を選んだとき、テナントの教師にメール */
export async function notifyTeachersStudentReceiveMethod(input: {
  organizationId: string;
  submissionId: string;
  taskId: string;
  studentName: string;
  method: "web" | "teacher_meeting";
  selectedAt: string;
}): Promise<void> {
  const roster = await buildTenantRoster(input.organizationId);
  const teachers = roster.teachers.filter((t) => (t.email ?? "").trim());
  if (teachers.length === 0) {
    console.info("[notify][receive-method] 教師メールなし", { org: input.organizationId });
    return;
  }

  const methodLabel = input.method === "web" ? "Web確認" : "講師面談";
  const listUrl = opsSubmissionsListUrl();
  const detailUrl = listUrl
    ? `${listUrl}/${encodeURIComponent(input.submissionId)}`
    : null;

  const lines = [
    "生徒が添削結果の受け取り方法を選択しました。",
    "",
    `受け取り: ${methodLabel}`,
    `課題ID: ${input.taskId}`,
    `受付ID: ${input.submissionId}`,
    `ニックネーム: ${input.studentName || "—"}`,
    `選択日時: ${input.selectedAt}`,
    "",
    "提出一覧の「受け取り」列でも確認できます。",
  ];
  if (detailUrl) lines.push("", `提出詳細: ${detailUrl}`);
  else if (listUrl) lines.push("", `提出一覧: ${listUrl}`);
  lines.push("", "— 添削革命 / next-writing-batch");

  const subject = `【添削革命】受け取り方法: ${methodLabel}（${input.taskId}）`;
  const text = lines.join("\n");

  for (const t of teachers) {
    const email = (t.email ?? "").trim();
    if (!email) continue;
    await sendResendPlainEmail(email, subject, text);
    console.info("[notify][receive-method] sent", { to: email, submissionId: input.submissionId, method: input.method });
  }
}
