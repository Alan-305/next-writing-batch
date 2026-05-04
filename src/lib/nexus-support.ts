/**
 * Nexus Learning と同じ経路（GAS support シート + 運営宛メール）。
 * GAS は変更しないため、課題ID・学籍番号は content 先頭に含める。
 * 環境変数名は既存運用（apps_script / notify）と揃える。
 */

import nodemailer from "nodemailer";

const DEFAULT_BRAND_EMAIL = "support@nexus-learning.com";
const DEFAULT_SUPPORT_TIMEOUT_MS = 45_000;
const DEFAULT_LOG_TIMEOUT_MS = 12_000;

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function supportNotifyTo(): string {
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

function supportTimeoutMs(): number {
  const raw = env("APPS_SCRIPT_SUPPORT_TIMEOUT");
  if (!raw) return DEFAULT_SUPPORT_TIMEOUT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SUPPORT_TIMEOUT_MS;
  return Math.max(5000, n * 1000);
}

async function postAppsScriptJson(args: {
  endpointName: "support" | "inquiry" | "analysis";
  body: Record<string, unknown>;
}): Promise<boolean> {
  const url = env("APPS_SCRIPT_SUPPORT_URL");
  if (!url) return false;
  const token = env("APPS_SCRIPT_TOKEN");
  const payload: Record<string, unknown> = { ...args.body };
  if (token) payload.token = token;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), supportTimeoutMs());
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (r.status !== 200) {
      console.warn(
        `[postAppsScriptJson:${args.endpointName}] HTTP`,
        r.status,
        (await r.text()).slice(0, 500),
      );
      return false;
    }
    const text = await r.text();
    try {
      const data = JSON.parse(text) as { status?: string };
      if (data && typeof data === "object" && data.status === "error") {
        console.warn(`[postAppsScriptJson:${args.endpointName}] GAS error JSON:`, text.slice(0, 500));
        return false;
      }
    } catch {
      /* 非 JSON 応答は成功扱い */
    }
    return true;
  } catch (e) {
    console.warn(`[postAppsScriptJson:${args.endpointName}] request failed:`, e);
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Python の _post と同等: JSON POST、token 付与、200 + JSON status error チェック */
export async function postSupportToAppsScript(args: {
  studentName: string;
  email: string;
  content: string;
}): Promise<boolean> {
  return postAppsScriptJson({
    endpointName: "support",
    body: {
      kind: "support_student",
      // 互換: 旧 GAS 実装が読む可能性のあるキーも残す
      studentName: args.studentName,
      student_name: args.studentName,
      email: args.email,
      content: args.content,
    },
  });
}

export async function postTeacherInquiryToAppsScript(args: {
  name: string;
  email: string;
  message: string;
  channel?: string;
}): Promise<boolean> {
  return postAppsScriptJson({
    endpointName: "inquiry",
    body: {
      kind: "inquiry_teacher",
      name: args.name,
      email: args.email,
      channel: (args.channel ?? "").trim() || "tensaku_top",
      content: args.message,
    },
  });
}

export async function postAnalysisPhase1ToAppsScript(args: {
  taskId: string;
  submissionId: string;
  problemMemo?: string;
  evaluation: string;
  explanationContent?: string;
  explanationGrammar?: string;
  contentDeduction?: number;
  grammarDeduction?: number;
  scoreTotal?: number;
  wordCount?: number;
  source?: string;
}): Promise<boolean> {
  return postAppsScriptJson({
    endpointName: "analysis",
    body: {
      kind: "analysis_phase1",
      taskId: args.taskId,
      submissionId: args.submissionId,
      problemMemo: args.problemMemo ?? "",
      evaluation: args.evaluation,
      explanationContent: args.explanationContent ?? "",
      explanationGrammar: args.explanationGrammar ?? "",
      contentDeduction: args.contentDeduction,
      grammarDeduction: args.grammarDeduction,
      scoreTotal: args.scoreTotal,
      wordCount: args.wordCount,
      source: args.source ?? "ops",
    },
  });
}

async function sendViaResend(args: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = env("RESEND_API_KEY");
  if (!apiKey) return false;
  const to = args.to.trim();
  if (!to || !to.includes("@")) return false;
  const fromAddr = resendFrom();
  const payload: Record<string, unknown> = {
    from: fromAddr,
    to: [to],
    subject: args.subject,
    text: args.text,
  };
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
    console.error("[sendViaResend] HTTP", r.status, detail, { from: fromAddr, to });
    return false;
  } catch (e) {
    console.warn("[sendViaResend] failed:", e);
    return false;
  }
}

async function sendViaSmtp(args: {
  to: string;
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
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: sender, pass: password },
    });
    await transporter.sendMail({
      from: sender,
      to: args.to,
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

/** 運営受信箱（SUPPORT_NOTIFY_EMAIL）へ。Resend 優先・未設定時は SMTP。 */
async function sendToSupportInbox(args: {
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const toAddr = supportNotifyTo();
  if (env("RESEND_API_KEY")) {
    return sendViaResend({
      to: toAddr,
      subject: args.subject,
      text: args.text,
      replyTo: args.replyTo,
    });
  }
  console.warn(
    "[sendToSupportInbox] RESEND_API_KEY unset; using Gmail SMTP. Set RESEND_API_KEY for production.",
  );
  return sendViaSmtp({
    to: toAddr,
    subject: args.subject,
    text: args.text,
    replyTo: args.replyTo,
  });
}

/** services/notify.send_support_notification と同じ宛先・件名・Reply-To */
export async function sendSupportNotificationEmail(args: {
  studentName: string;
  email: string;
  body: string;
}): Promise<boolean> {
  const subject = `【Nexus Learning】サポートお問い合わせ: ${args.studentName || "氏名なし"}`;
  const reply = args.email.trim().includes("@") ? args.email.trim() : undefined;
  return sendToSupportInbox({ subject, text: args.body, replyTo: reply });
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

/** GAS の「内容」列用。氏名・メールは別列のため本文のみ前置情報＋お問い合わせ */
export function buildGasSupportContent(taskId: string, studentId: string, inquiry: string): string {
  return [`課題ID: ${taskId}`, `学籍番号: ${studentId}`, "", inquiry.trim()].join("\n");
}

/** メール本文（運営向け・全項目） */
export function buildSupportEmailBody(args: {
  taskId: string;
  studentId: string;
  studentName: string;
  email: string;
  inquiry: string;
}): string {
  return [
    `課題ID: ${args.taskId}`,
    `学籍番号: ${args.studentId}`,
    `氏名: ${args.studentName}`,
    `メール: ${args.email}`,
    "",
    "お問い合わせ内容:",
    args.inquiry.trim(),
    "",
  ].join("\n");
}
