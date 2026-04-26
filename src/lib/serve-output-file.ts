import { readFile, realpath } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

const KINDS = new Set(["audio", "qr", "pdf"]);

function contentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function segmentOk(seg: string): boolean {
  if (!seg || seg.length > 500) return false;
  if (seg.includes("..") || seg.includes("/") || seg.includes("\\")) return false;
  return true;
}

/** RFC 5987 の filename* で日本語などを渡し、古い UA 用に ASCII の filename も付ける */
function contentDispositionPdfAttachment(displayName: string): string {
  const trimmed = displayName.trim().slice(0, 200) || "result.pdf";
  const ext = path.extname(trimmed) || ".pdf";
  const stem = trimmed.endsWith(ext) ? trimmed.slice(0, -ext.length) : trimmed;
  const asciiStem = stem
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 120);
  const asciiName = `${asciiStem || "feedback"}${ext}`;
  const star = encodeURIComponent(trimmed).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${star}`;
}

/**
 * GET /output/audio|qr|pdf/... 用。segments は URL の /output/ 以降。
 */
export async function getOutputFileResponse(
  segments: string[] | undefined,
  options?: { forceDownload?: boolean },
): Promise<NextResponse> {
  if (!segments?.length) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  if (!KINDS.has(segments[0]!)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  for (const seg of segments) {
    if (!segmentOk(seg)) {
      return NextResponse.json({ message: "Bad request" }, { status: 400 });
    }
  }

  const outputRoot = path.join(process.cwd(), "output");
  let candidate: string;
  try {
    candidate = path.join(outputRoot, ...segments);
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  let realRoot: string;
  let realFile: string;
  try {
    realRoot = await realpath(outputRoot);
    realFile = await realpath(candidate);
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const rel = path.relative(realRoot, realFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    const buf = await readFile(realFile);
    const name = segments[segments.length - 1] ?? "file";
    const ct = contentType(name);
    const headers: Record<string, string> = {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=300",
    };
    // 既定は inline（印刷プレビューの安定性を優先）。必要時のみ attachment。
    if (ct === "application/pdf") {
      if (options?.forceDownload) {
        headers["Content-Disposition"] = contentDispositionPdfAttachment(name);
      } else {
        headers["Content-Disposition"] = "inline";
      }
    }
    return new NextResponse(buf, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}
