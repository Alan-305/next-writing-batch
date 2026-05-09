import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { requireTeacherOrAllowlistAdmin } from "@/lib/auth/require-teacher-or-allowlist";
import { resolveEffectiveGeminiApiKey } from "@/lib/gemini-key-store";
import { runProblemIngestGemini } from "@/lib/problem-ingest-gemini";
import { normalizeVisionImagePartForApi } from "@/lib/vision-ingest-normalize-heif";

export const runtime = "nodejs";

function guessMime(file: File): string {
  const t = (file.type || "").split(";")[0].trim().toLowerCase();
  if (t && t !== "application/octet-stream") return t;
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".bmp")) return "image/bmp";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  if (/\.jpe?g$/i.test(n)) return "image/jpeg";
  return "image/jpeg";
}

function isMediaFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  if (t === "application/pdf") return true;
  const n = file.name.toLowerCase();
  return /\.(pdf|jpe?g|png|gif|webp|bmp|tif|tiff|heic|heif)$/i.test(n);
}

/**
 * カスタム自由英作文の /ocr_process と同様:
 * - mode=plain → 先頭1ファイルのみ（problem プロンプト）
 * - mode=structured → 複数パート（problem_structured プロンプト）
 */
export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;
  const teacherGate = await requireTeacherOrAllowlistAdmin(auth.uid);
  if (!teacherGate.ok) return teacherGate.response;

  const apiKey = resolveEffectiveGeminiApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Gemini API キーがありません。環境変数 GEMINI_API_KEY（または GOOGLE_API_KEY）を設定するか、運用の「Gemini API キー」画面で data/gemini_api_key.txt に保存してください。",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "フォームデータの解析に失敗しました。" }, { status: 400 });
  }

  const modeRaw = String(form.get("mode") || "plain").toLowerCase();
  const mode = modeRaw === "structured" ? "structured" : "plain";
  const files = form.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません。" }, { status: 400 });
  }

  const media = files.filter(isMediaFile);
  if (media.length === 0) {
    return NextResponse.json({ error: "画像または PDF のみ対応です。" }, { status: 400 });
  }

  const toIngest = mode === "plain" ? media.slice(0, 1) : media;

  try {
    const rawParts = await Promise.all(
      toIngest.map(async (f) => ({
        mimeType: guessMime(f),
        data: new Uint8Array(await f.arrayBuffer()),
        fileName: f.name,
      })),
    );
    const parts = await Promise.all(rawParts.map((p) => normalizeVisionImagePartForApi(p)));

    const text = await runProblemIngestGemini({
      apiKey,
      mode,
      parts,
    });

    if (!text.trim()) {
      return NextResponse.json(
        { error: "モデルからテキストが返りませんでした。画像の解像度や内容を確認してください。" },
        { status: 502 },
      );
    }

    if (text.startsWith("読み取りエラー:")) {
      return NextResponse.json({ error: text }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      text,
      usedFirstOnly: mode === "plain" && media.length > 1,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "読み取りに失敗しました。" }, { status: 502 });
  }
}
