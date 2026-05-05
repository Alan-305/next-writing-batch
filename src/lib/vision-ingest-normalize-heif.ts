import sharp from "sharp";

function isHeifMime(mimeType: string): boolean {
  const m = (mimeType || "").split(";")[0].trim().toLowerCase();
  return m.includes("heic") || m.includes("heif");
}

function isHeifFileName(name: string | undefined): boolean {
  return /\.(heic|heif)$/i.test(name ?? "");
}

async function heifToJpegViaSharp(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const buf = await sharp(Buffer.from(data), { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

/**
 * sharp のプリビルドは HEVC の HEIC（iPhone 標準）を読めないことが多い。
 * heic-convert（heic-decode + jpeg-js）でデコードしてから、向き補正のため sharp に通す。
 */
async function heifToJpegViaHeicConvert(data: Uint8Array): Promise<Uint8Array> {
  const convert = (await import("heic-convert")).default;
  const jpegBuf = await convert({
    buffer: Buffer.from(data),
    format: "JPEG",
    quality: 0.92,
  });
  const base = Buffer.isBuffer(jpegBuf) ? jpegBuf : Buffer.from(jpegBuf);
  try {
    const buf = await sharp(base, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return new Uint8Array(buf);
  } catch {
    return new Uint8Array(base);
  }
}

/**
 * Claude / Gemini 向けに HEIC/HEIF を JPEG に正規化する（クライアントの heic2any 失敗時の保険）。
 * それ以外の画像はそのまま返す。
 */
export async function normalizeVisionImagePartForApi(part: {
  mimeType: string;
  data: Uint8Array;
  fileName?: string;
}): Promise<{ mimeType: string; data: Uint8Array }> {
  const heif = isHeifMime(part.mimeType) || isHeifFileName(part.fileName);
  if (!heif) {
    return { mimeType: part.mimeType, data: part.data };
  }

  const fromSharp = await heifToJpegViaSharp(part.data);
  if (fromSharp) {
    return { mimeType: "image/jpeg", data: fromSharp };
  }

  try {
    const fromHeicConvert = await heifToJpegViaHeicConvert(part.data);
    return { mimeType: "image/jpeg", data: fromHeicConvert };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `HEIC/HEIF を JPEG に変換できませんでした（${detail}）。写真アプリで JPEG に書き出すか、「互換性優先」で保存してから再度お試しください。`,
    );
  }
}
