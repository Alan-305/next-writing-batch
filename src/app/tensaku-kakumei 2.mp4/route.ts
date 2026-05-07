import { createReadStream, existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cloud Run 等の単発レスポンス上限を避けるため、Range 応答はこのサイズに切り詰める */
const MAX_RANGE_BYTES = 16 * 1024 * 1024;

function videoPath(): string {
  return path.join(process.cwd(), "assets", "tensaku-kakumei.mp4");
}

/**
 * 単一の bytes= 範囲を解釈する（カンマ区切り複数範囲は先頭のみ）。
 * suffix: bytes=-500
 */
function parseSingleRange(
  rangeHeader: string,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const v = rangeHeader.trim();
  if (!v.startsWith("bytes=")) return null;
  const part = v.slice("bytes=".length).split(",")[0]?.trim() ?? "";
  if (!part) return null;

  const dash = part.indexOf("-");
  if (dash < 0) return null;
  const startRaw = part.slice(0, dash);
  const endRaw = part.slice(dash + 1);

  let start: number;
  let end: number;

  if (startRaw === "" && endRaw !== "") {
    const suffix = parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(startRaw, 10);
    if (!Number.isFinite(start)) return null;
    end = endRaw === "" ? size - 1 : parseInt(endRaw, 10);
    if (!Number.isFinite(end)) return null;
  }

  if (start < 0 || start >= size) return "unsatisfiable";
  if (end < start) return "unsatisfiable";
  if (end >= size) end = size - 1;

  if (end - start + 1 > MAX_RANGE_BYTES) {
    end = start + MAX_RANGE_BYTES - 1;
  }
  return { start, end };
}

function streamWeb(filePath: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const nodeStream =
    start !== undefined && end !== undefined ? createReadStream(filePath, { start, end }) : createReadStream(filePath);
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export async function HEAD() {
  const filePath = videoPath();
  if (!existsSync(filePath)) {
    return new NextResponse(null, { status: 404 });
  }
  const size = statSync(filePath).size;
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function GET(req: NextRequest) {
  const filePath = videoPath();
  if (!existsSync(filePath)) {
    return new NextResponse("Video file missing (expected assets/tensaku-kakumei.mp4).", { status: 404 });
  }

  const size = statSync(filePath).size;
  const range = req.headers.get("range");

  if (range) {
    const parsed = parseSingleRange(range, size);
    if (parsed === "unsatisfiable") {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    if (parsed) {
      const { start, end } = parsed;
      const chunk = end - start + 1;
      return new NextResponse(streamWeb(filePath, start, end), {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunk),
          "Content-Type": "video/mp4",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // 初回など Range なし: チャンク転送で全体を流す（32MB 超の単一 Content-Length を避ける）
  return new NextResponse(streamWeb(filePath), {
    status: 200,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Type": "video/mp4",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
