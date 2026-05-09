import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { isStudentProfileComplete } from "@/lib/student-profile-gate";
import { isTeacherByRoles, needsStudentSubjectProfile, normalizeRoles } from "@/lib/auth/user-roles";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import { getAdminFirestore } from "@/lib/firebase/admin-firestore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NICKNAME_MAX = 60;
const STUDENT_NUMBER_MAX = 32;

type PutBody = {
  studentNumber?: unknown;
  nickname?: unknown;
};

function validateStudentNumber(raw: string): string | null {
  const s = raw.normalize("NFKC").trim();
  if (!s) return null;
  if (s.length > STUDENT_NUMBER_MAX) return null;
  if (!/^[\w.-]+$/.test(s)) return null;
  return s;
}

function validateNickname(raw: string): string | null {
  const s = raw.normalize("NFKC").trim();
  if (!s) return null;
  if (s.length > NICKNAME_MAX) return null;
  return s;
}

/** GET: サインイン後の遷移判定・設定画面用メタ */
export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  const db = getAdminFirestore();
  const snap = await db.collection("users").doc(auth.uid).get();
  if (!snap.exists) {
    return NextResponse.json({
      ok: true,
      roles: [] as string[],
      organizationId: null as string | null,
      studentNumber: null as string | null,
      nickname: null as string | null,
      needsStudentProfile: false,
      isStudentProfileComplete: true,
    });
  }

  const roles = normalizeRoles(snap.get("roles"));
  const organizationId =
    snap.get("organizationId") === undefined || snap.get("organizationId") === null
      ? null
      : String(snap.get("organizationId"));
  const studentNumber = snap.get("studentNumber");
  const nickname = snap.get("nickname");
  const needs = needsStudentSubjectProfile(roles);
  const complete = isStudentProfileComplete(roles, {
    roles,
    organizationId,
    studentNumber: studentNumber != null ? String(studentNumber) : null,
    nickname: nickname != null ? String(nickname) : null,
  });

  return NextResponse.json({
    ok: true,
    roles,
    organizationId,
    studentNumber: studentNumber != null ? String(studentNumber) : null,
    nickname: nickname != null ? String(nickname) : null,
    needsStudentProfile: needs,
    isStudentProfileComplete: complete,
  });
}

/** PUT: 本人プロフィールの作成・更新（Firestore ルールはクライアント直書き不可のまま） */
export async function PUT(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;

  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("users").doc(auth.uid);
  const snap = await ref.get();
  const roles = snap.exists ? normalizeRoles(snap.get("roles")) : [];
  const organizationId = snap.exists ? String(snap.get("organizationId") ?? "").trim() : "";

  const rawStudent = body.studentNumber != null ? String(body.studentNumber) : "";
  const rawNick = body.nickname != null ? String(body.nickname) : "";

  if (isTeacherByRoles(roles)) {
    if (rawStudent.trim()) {
      return NextResponse.json(
        { ok: false, message: "教員アカウントでは学籍番号を保存できません。" },
        { status: 422 },
      );
    }
    const nick = rawNick.trim() ? validateNickname(rawNick) : "";
    if (rawNick.trim() && !nick) {
      return NextResponse.json(
        { ok: false, message: `ニックネームは ${NICKNAME_MAX} 文字以内で入力してください。` },
        { status: 422 },
      );
    }
    await ref.set(
      {
        ...(nick ? { nickname: nick } : {}),
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, message: "保存しました。" });
  }

  if (!needsStudentSubjectProfile(roles)) {
    return NextResponse.json(
      {
        ok: false,
        message: "生徒として登録されていません。招待リンクからログインし直してください。",
      },
      { status: 422 },
    );
  }

  if (!organizationId) {
    return NextResponse.json(
      {
        ok: false,
        message: "学校への参加が完了していません。教員からの招待リンクからログインしてください。",
      },
      { status: 422 },
    );
  }

  const studentNumber = validateStudentNumber(rawStudent);
  const nickname = validateNickname(rawNick);
  if (!studentNumber) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "学籍番号を入力してください（半角英数字・記号 ._- のみ、32文字以内）。",
        fields: { studentNumber: "学籍番号が不正です。" },
      },
      { status: 422 },
    );
  }
  if (!nickname) {
    return NextResponse.json(
      {
        ok: false,
        code: "VALIDATION_ERROR",
        message: `ニックネーム（表示名）を ${NICKNAME_MAX} 文字以内で入力してください。`,
        fields: { nickname: "ニックネームが不正です。" },
      },
      { status: 422 },
    );
  }

  const prevCompleted = snap.exists ? snap.get("studentProfileCompletedAt") : null;
  await ref.set(
    {
      studentNumber,
      nickname,
      ...(!prevCompleted ? { studentProfileCompletedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, message: "保存しました。" });
}
