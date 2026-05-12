import { NextResponse } from "next/server";

import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { verifyBearerUid } from "@/lib/auth/verify-bearer-uid";
import {
  clearAnthropicApiKeyFile,
  describeAnthropicKeySource,
  writeAnthropicApiKeyToDisk,
} from "@/lib/anthropic-key-store";

export const dynamic = "force-dynamic";

type PostBody = { apiKey?: string };

/**
 * 本番ホスティングでは平文ファイル保存を既定で禁止（誤露出防止）。
 * 自前サーバで使うときは OPS_ALLOW_ANTHROPIC_KEY_FILE=true を付与。
 */
function allowKeyFileWrite(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.OPS_ALLOW_ANTHROPIC_KEY_FILE === "true";
}

export async function GET(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const { configured, source } = describeAnthropicKeySource();
  return NextResponse.json({
    ok: true,
    configured,
    source,
    filePath: "data/anthropic_api_key.txt",
  });
}

export async function POST(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  if (!allowKeyFileWrite()) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "本番環境では既定でキー保存を無効にしています。環境変数 NEXT_WRITING_BATCH_KEY を設定するか、OPS_ALLOW_ANTHROPIC_KEY_FILE=true のうえで運用してください。",
      },
      { status: 403 },
    );
  }

  let body: PostBody = {};
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, message: "JSON が必要です。" }, { status: 400 });
  }

  const apiKey = String(body.apiKey ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, message: "apiKey を入力してください。" }, { status: 400 });
  }

  try {
    writeAnthropicApiKeyToDisk(apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: msg }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "保存しました。添削バッチ（Claude）で利用されます。",
  });
}

export async function DELETE(request: Request) {
  const auth = await verifyBearerUid(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  if (!allowKeyFileWrite()) {
    return NextResponse.json({ ok: false, message: "本番では削除 API を無効にしています。" }, { status: 403 });
  }
  clearAnthropicApiKeyFile();
  return NextResponse.json({ ok: true, message: "保存ファイルを削除しました。" });
}
