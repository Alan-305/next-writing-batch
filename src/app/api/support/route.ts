import { NextResponse } from "next/server";

import {
  buildTenantRoster,
  resolvePrimaryTeacherEmailForOrganization,
} from "@/lib/admin/tenant-roster";
import { loadUserProfileAdmin } from "@/lib/auth/load-user-profile-admin";
import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { isTeacherByRoles, normalizeRoles } from "@/lib/auth/user-roles";
import { getAdminAuth } from "@/lib/firebase/admin-app";
import { loadTaskProblemsMaster } from "@/lib/load-task-problems-master";
import { buildSupportEmailBody, sendStudentSupportInquiryEmail } from "@/lib/nexus-support";
import { validateTaskIdForStorage } from "@/lib/task-id-policy";

export const runtime = "nodejs";

const MAX_INQUIRY = 10_000;

type Body = {
  taskId?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON 形式で送信してください。" }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!taskId || !content) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "課題IDとお問い合わせ内容を入力してください。" },
      { status: 422 },
    );
  }
  const tidErr = validateTaskIdForStorage(taskId);
  if (tidErr) {
    return NextResponse.json({ ok: false, code: "VALIDATION", message: tidErr }, { status: 422 });
  }
  if (content.length > MAX_INQUIRY) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: `お問い合わせ内容は ${MAX_INQUIRY} 文字以内にしてください。` },
      { status: 422 },
    );
  }

  const profile = await loadUserProfileAdmin(auth.uid);
  const roles = profile ? normalizeRoles(profile.roles) : [];

  if (isTeacherByRoles(roles)) {
    return NextResponse.json(
      { ok: false, code: "FORBIDDEN", message: "このお問い合わせは生徒向けです。" },
      { status: 403 },
    );
  }

  const profileOrg = String(profile?.organizationId ?? "").trim();
  if (!profileOrg || profileOrg !== auth.organizationId) {
    return NextResponse.json(
      {
        ok: false,
        code: "FORBIDDEN",
        message: "クラス（テナント）の確認に失敗しました。招待リンクから再度登録してください。",
      },
      { status: 403 },
    );
  }

  const roster = await buildTenantRoster(auth.organizationId);
  if (!roster.students.some((s) => s.uid === auth.uid)) {
    return NextResponse.json(
      {
        ok: false,
        code: "FORBIDDEN",
        message: "このクラスに登録された生徒のみお問い合わせできます。",
      },
      { status: 403 },
    );
  }

  const master = await loadTaskProblemsMaster(auth.organizationId, taskId);
  if (!master) {
    return NextResponse.json(
      {
        ok: false,
        code: "UNKNOWN_TASK",
        message: "この課題は、あなたのクラスに登録されていません。リストから選び直してください。",
      },
      { status: 422 },
    );
  }

  let authEmail = "";
  try {
    const authUser = await getAdminAuth().getUser(auth.uid);
    authEmail = (authUser.email ?? "").trim();
  } catch {
    authEmail = "";
  }
  if (!authEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, message: "Google ログインのメールアドレスが取得できません。再ログインしてください。" },
      { status: 422 },
    );
  }

  const studentId = String(profile?.studentNumber ?? "").trim();
  const studentName = String(profile?.nickname ?? "").trim() || "—";

  const teacherEmail = await resolvePrimaryTeacherEmailForOrganization(auth.organizationId);
  if (!teacherEmail) {
    return NextResponse.json(
      {
        ok: false,
        message: "担当の先生のメールが見つかりませんでした。しばらくしてから再度お試しください。",
      },
      { status: 502 },
    );
  }

  const mailBody = buildSupportEmailBody({
    organizationId: auth.organizationId,
    taskId,
    studentId,
    studentName,
    email: authEmail,
    inquiry: content,
  });

  const mailOk = await sendStudentSupportInquiryEmail({
    teacherEmail,
    studentName,
    replyToEmail: authEmail,
    body: mailBody,
  });

  if (mailOk) {
    return NextResponse.json({ ok: true, message: "送信しました。担当の先生に届きます。ありがとうございます。" });
  }

  return NextResponse.json(
    {
      ok: false,
      message: "送信に失敗しました。しばらくしてから再度お試しください。",
    },
    { status: 502 },
  );
}
