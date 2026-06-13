/**
 * サポート・お問い合わせのメール送信。
 * 環境変数名は既存運用（notify）と揃える。
 */

import nodemailer from "nodemailer";

const DEFAULT_BRAND_EMAIL = "support@nexus-learning.com";

/** 生徒サポート問い合わせの事務局 CC（固定） */
export const STUDENT_SUPPORT_OFFICE_CC = "support@nexus-learning.com";
const DEFAULT_LOG_TIMEOUT_MS = 12_000;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** 事務局 CC 用（未設定時は EMAIL_SENDER） */
export function supportOfficeEmail(): string {
  const sender = env("EMAIL_SENDER") || DEFAULT_BRAND_EMAIL;
  return env("SUPPORT_NOTIFY_EMAIL") || sender;
}

function normalizeFromDisplay(s: string): string {
  let t = s.trim();
  if (!t) return t;
  if (t.includes("<") && !/\s</.test(t)) {
    t = t.replace(/([^\s])</, "$1 <");
  }
  return t;
}

/**
 * Resend の from。検証済みドメイン以外（例: support@nexus-learning.com のまま）は API が 4xx になる。
 * 未指定時は Resend ドキュメントの検証用と揃える（本番は DNS 検証後に RESEND_FROM_EMAIL を必ず設定）。
 */
function resendFrom(): string {
  const explicit = env("RESEND_FROM_EMAIL");
  if (explicit) return normalizeFromDisplay(explicit);
  return "Nexus Learning <onboarding@resend.dev>";
}

function normalizeEmailList(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    const t = raw.trim();
    if (!t.includes("@")) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function sendViaResend(args: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return false;
  const to = normalizeEmailList(args.to);
  if (to.length === 0) return false;
  const cc = normalizeEmailList(args.cc ?? []).filter(
    (addr) => !to.some((t) => t.toLowerCase() === addr.toLowerCase()),
  );
  const fromAddr = resendFrom();
  const payload: Record<string, unknown> = {
    from: fromAddr,
    to,
    subject: args.subject,
    text: args.text,
  };
  if (cc.length > 0) payload.cc = cc;
  if (args.replyTo?.trim().includes("@")) {
    payload.reply_to = args.replyTo.trim();
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Math.min(DEFAULT_LOG_TIMEOUT_MS * 2, 30_000)),
    });
    if (r.ok) return true;
    const detail = (await r.text()).slice(0, 2000);
    console.error("[sendViaResend] HTTP", r.status, detail, { from: fromAddr, to, cc });
    return false;
  } catch (e) {
    console.warn("[sendViaResend] failed:", e);
    return false;
  }
}

async function sendViaSmtp(args: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const sender = env("EMAIL_SENDER") || DEFAULT_BRAND_EMAIL;
  const password = env("EMAIL_PASSWORD");
  if (!password) {
    console.warn("[sendViaSmtp] EMAIL_PASSWORD unset; cannot use SMTP");
    return false;
  }
  const to = normalizeEmailList(args.to);
  if (to.length === 0) return false;
  const cc = normalizeEmailList(args.cc ?? []).filter(
    (addr) => !to.some((t) => t.toLowerCase() === addr.toLowerCase()),
  );
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: sender, pass: password },
    });
    await transporter.sendMail({
      from: sender,
      to: to.join(", "),
      ...(cc.length > 0 ? { cc: cc.join(", ") } : {}),
      subject: args.subject,
      text: args.text,
      ...(args.replyTo?.trim().includes("@") ? { replyTo: args.replyTo.trim() } : {}),
    });
    return true;
  } catch (e) {
    console.warn("[sendViaSmtp] failed:", e);
    return false;
  }
}

async function sendEmail(args: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  if (env("RESEND_API_KEY")) {
    return sendViaResend(args);
  }
  console.warn(
    "[sendEmail] RESEND_API_KEY unset; using Gmail SMTP. Set RESEND_API_KEY for production.",
  );
  return sendViaSmtp(args);
}

/** 運営受信箱（SUPPORT_NOTIFY_EMAIL）へ。添削革命サイトの問い合わせ等。 */
async function sendToSupportInbox(args: {
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const office = supportOfficeEmail();
  return sendEmail({
    to: [office],
    subject: args.subject,
    text: args.text,
    replyTo: args.replyTo,
  });
}

/**
 * 生徒のサポート問い合わせ: 担当教師 1 名を To、support@nexus-learning.com を CC。
 */
export async function sendStudentSupportInquiryEmail(args: {
  teacherEmail: string;
  studentName: string;
  replyToEmail: string;
  body: string;
}): Promise<boolean> {
  const teacher = args.teacherEmail.trim();
  if (!teacher.includes("@")) return false;

  const subject = `【添削革命】生徒からのお問い合わせ: ${args.studentName || "氏名なし"}`;
  const reply = args.replyToEmail.trim().includes("@") ? args.replyToEmail.trim() : undefined;
  const cc =
    teacher.toLowerCase() === STUDENT_SUPPORT_OFFICE_CC.toLowerCase()
      ? []
      : [STUDENT_SUPPORT_OFFICE_CC];

  return sendEmail({
    to: [teacher],
    cc,
    subject,
    text: args.body,
    replyTo: reply,
  });
}

/** 添削革命サイトの「サポート・ご相談」（課題IDなし）。notify と同じ環境変数。 */
export async function sendTensakuKakumeiContactEmail(args: {
  name: string;
  email: string;
  message: string;
}): Promise<boolean> {
  const subject = `【添削革命】お問い合わせ: ${args.name || "氏名なし"}`;
  const text = [
    `氏名: ${args.name}`,
    `メール: ${args.email}`,
    "",
    "お問い合わせ内容:",
    args.message.trim(),
    "",
  ].join("\n");
  const reply = args.email.trim().includes("@") ? args.email.trim() : undefined;
  return sendToSupportInbox({ subject, text, replyTo: reply });
}

/** 教員向け「生徒サポート」ログイン URL（メール内リンク用・ログイン後に画面へ） */
export function resolveOpsStudentSupportSignInUrl(fallbackOrigin?: string): string {
  const fromEnv = (
    process.env.NWB_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_NWB_PUBLIC_APP_URL ??
    ""
  )
    .trim()
    .replace(/\/$/, "");
  let base = fromEnv;
  if (!base) {
    base = (fallbackOrigin ?? "").trim().replace(/\/$/, "");
  }
  if (!base) return "";
  const root = base.startsWith("http") ? base : `https://${base}`;
  const next = encodeURIComponent("/ops/student-support");
  return `${root}/sign-in?next=${next}`;
}

/** 匿名生徒のサポート問い合わせ（メール本文） */
export function buildAnonymousSupportEmailBody(args: {
  organizationId: string;
  displayNick: string;
  redeemId: string;
  taskId?: string;
  inquiry: string;
  opsStudentSupportUrl?: string;
}): string {
  const supportUrl = (args.opsStudentSupportUrl ?? "").trim();
  return [
    `テナントID: ${args.organizationId}`,
    `ニックネーム: ${args.displayNick || "—"}`,
    `引換ID: ${args.redeemId || "—"}`,
    ...(args.taskId?.trim() ? [`課題ID: ${args.taskId.trim()}`] : []),
    "",
    "お問い合わせ内容:",
    args.inquiry.trim(),
    "",
    "※ 返信手順: 下記URLを開き「Google でログイン（推奨）」からログインしてください（Safari ではポップアップを許可）。",
    "※ ログイン後、生徒サポート画面が開きます。返信は生徒のメッセージボックスに届きます。",
    ...(supportUrl ? ["", supportUrl] : []),
    "",
  ].join("\n");
}

/** メール本文（教師・事務局向け） */
export function buildSupportEmailBody(args: {
  organizationId: string;
  taskId: string;
  studentId: string;
  studentName: string;
  email: string;
  inquiry: string;
}): string {
  return [
    `テナントID: ${args.organizationId}`,
    `課題ID: ${args.taskId}`,
    `学籍番号: ${args.studentId || "—"}`,
    `氏名: ${args.studentName || "—"}`,
    `メール: ${args.email}`,
    "",
    "お問い合わせ内容:",
    args.inquiry.trim(),
    "",
  ].join("\n");
}
