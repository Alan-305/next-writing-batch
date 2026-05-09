import { NextResponse } from "next/server";

import { verifyBearerUidAndOrganization } from "@/lib/auth/resolve-bearer-organization";
import { resolveEffectiveAnthropicApiKey } from "@/lib/anthropic-key-store";
import { runEssayHandwritingIngestClaude } from "@/lib/essay-handwriting-claude";
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
 * 提出フォームの英文欄向け: 手書き写真・HEIC・PDF を Claude で転記（Tesseract より高精度）。
 */
export async function POST(request: Request) {
  const auth = await verifyBearerUidAndOrganization(request);
  if (!auth.ok) return auth.response;

  const apiKey = resolveEffectiveAnthropicApiKey();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Claude API キーがありません。環境変数 ANTHROPIC_API_KEY を設定するか、運用の「Claude API キー」画面で data/anthropic_api_key.txt に保存してください。",
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

  const files = form.getAll("files").filter((x): x is File => x instanceof File && x.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません。" }, { status: 400 });
  }

  const media = files.filter(isMediaFile);
  if (media.length === 0) {
    return NextResponse.json({ error: "画像または PDF のみ対応です。" }, { status: 400 });
  }

  try {
    const rawParts = await Promise.all(
      media.map(async (f) => ({
        mimeType: guessMime(f),
        data: new Uint8Array(await f.arrayBuffer()),
        fileName: f.name,
      })),
    );
    const parts = await Promise.all(rawParts.map((p) => normalizeVisionImagePartForApi(p)));

    const text = await runEssayHandwritingIngestClaude({
      apiKey,
      parts,
    });

    if (!text.trim()) {
      return NextResponse.json(
        { error: "モデルからテキストが返りませんでした。画像の解像度や内容を確認してください。" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      text,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "読み取りに失敗しました。" }, { status: 502 });
  }
}
