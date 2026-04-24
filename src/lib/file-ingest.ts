/**
 * 画像（Tesseract eng）・PDF（pdf.js）・テキスト系ファイルからプレーンテキストを取り込む。
 * ブラウザのみ（提出画面・課題設定と同じ運用）。
 */

let pdfWorkerConfigured = false;

async function configurePdfWorker(): Promise<void> {
  if (pdfWorkerConfigured) return;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  pdfWorkerConfigured = true;
}

export function mergeExtractedBlock(existing: string, extracted: string, label: string): string {
  const e = extracted.trim();
  if (!e) return existing;
  const sep = `\n\n--- ${label} ---\n\n`;
  return existing.trim() ? `${existing.trim()}${sep}${e}` : e;
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    r.readAsText(file, "UTF-8");
  });
}

export function isImageFile(file: File): boolean {
  return (file.type || "").toLowerCase().startsWith("image/");
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

export function isJsonFile(file: File): boolean {
  return file.type === "application/json" || /\.json$/i.test(file.name || "");
}

/** プレーンテキストとしてブラウザで読むファイル（Gemini 不要のテキスト取り込み用） */
export function isPlainTextDataFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("text/")) return true;
  const n = (file.name || "").toLowerCase();
  return /\.(txt|md|csv|log|tsv|text)$/i.test(n);
}

function isLikelyUnsupportedOffice(file: File): boolean {
  const n = (file.name || "").toLowerCase();
  return /\.(docx?|xlsx?|pptx?)$/i.test(n);
}

/** Tesseract（WASM）が解読できないときの内部エラー文言 */
function isTesseractImageReadError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    /attempting to read image/i.test(message) ||
    m.includes("could not read image") ||
    m.includes("invalid image") ||
    m.includes("unsupported image")
  );
}

function isLikelyHeicOrHeif(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.includes("heic") || t.includes("heif")) return true;
  const n = (file.name || "").toLowerCase();
  return /\.(heic|heif)$/i.test(n);
}

/** iPhone HEIC 等を JPEG に変換（heic2any）。失敗時は null。 */
async function heicToJpegBlob(file: File): Promise<Blob | null> {
  if (!isLikelyHeicOrHeif(file)) return null;
  try {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    const b = Array.isArray(out) ? out[0] : out;
    return b instanceof Blob ? b : null;
  } catch {
    return null;
  }
}

function ocrImageReadErrorJa(fileName: string): string {
  return (
    `画像「${fileName}」をブラウザ内 OCR（Tesseract）が解読できませんでした。` +
    `iPhone の HEIC や特殊な JPEG の場合は、写真アプリで「互換性優先」にするか、JPEG / PNG に書き出してから再度ドロップしてください。` +
    `（課題文の読み取りでは GEMINI_API_KEY を設定すると Gemini 経由で読める場合があります。）`
  );
}

/**
 * ブラウザでデコードして PNG に落とすと、Tesseract が読めない形式（一部 HEIC 等）を避けられる。
 * クライアント専用（createImageBitmap / canvas）。
 */
async function decodeImageFileToPngBlob(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return null;
  }
  try {
    const imageBitmap = await createImageBitmap(file);
    try {
      const w = imageBitmap.width;
      const h = imageBitmap.height;
      if (w <= 0 || h <= 0) return null;
      const maxEdge = 4096;
      let cw = w;
      let ch = h;
      if (Math.max(w, h) > maxEdge) {
        const scale = maxEdge / Math.max(w, h);
        cw = Math.max(1, Math.floor(w * scale));
        ch = Math.max(1, Math.floor(h * scale));
      }
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(imageBitmap, 0, 0, cw, ch);
      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/png", 0.85);
      });
    } finally {
      imageBitmap.close();
    }
  } catch {
    return null;
  }
}

/** 英字中心のテキストらしさ（0〜1 付近）。OCR 結果の良し悪し比較用 */
function latinTextScore(text: string): number {
  const compact = text.replace(/\s+/g, "");
  if (!compact.length) return 0;
  let score = 0;
  for (const ch of compact) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) score += 1;
    else if ("'\",-.!?;:()0123456789/".includes(ch)) score += 0.22;
    else if (c >= 0x3040 && c <= 0x9fff) score -= 0.75;
    else if (c < 128) score += 0.04;
  }
  return score / compact.length;
}

/**
 * 英作文向け: グレースケール・コントラスト・短辺を拡大してから PNG 化（手書き写真の解像度不足を緩和）
 */
async function preprocessBlobForEngOcr(src: Blob | File): Promise<Blob | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return null;
  }
  const blob =
    src instanceof File
      ? new Blob([await src.arrayBuffer()], { type: src.type || "application/octet-stream" })
      : src;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob);
  } catch {
    return null;
  }
  try {
    const w0 = bmp.width;
    const h0 = bmp.height;
    if (w0 <= 0 || h0 <= 0) return null;
    const short0 = Math.min(w0, h0);
    const minShort = 1280;
    let scale = 1;
    if (short0 < minShort) {
      scale = Math.min(2.8, minShort / short0);
    }
    if (Math.max(w0, h0) * scale > 4200) {
      scale = 4200 / Math.max(w0, h0);
    }
    const cw = Math.max(1, Math.round(w0 * scale));
    const ch = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, cw, ch);
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    const contrast = 1.38;
    const mid = 128;
    for (let i = 0; i < d.length; i += 4) {
      const y = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      let v = (y - mid) * contrast + mid;
      if (v < 0) v = 0;
      if (v > 255) v = 255;
      const u = Math.round(v);
      d[i] = u;
      d[i + 1] = u;
      d[i + 2] = u;
    }
    ctx.putImageData(img, 0, 0);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png", 0.93);
    });
  } finally {
    bmp.close();
  }
}

async function recognizeEngBestEffort(
  worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>>,
  PSM: typeof import("tesseract.js").PSM,
  tryOrder: (Blob | File)[],
): Promise<{ text: string; lastErr: unknown }> {
  const modes = [PSM.AUTO, PSM.SINGLE_BLOCK, PSM.SINGLE_COLUMN] as const;
  let best = "";
  let bestScore = -1;
  let lastErr: unknown;

  for (const src of tryOrder) {
    const pre = await preprocessBlobForEngOcr(src);
    const variants: (Blob | File)[] = [];
    if (pre && pre.size > 0) variants.push(pre);
    variants.push(src);

    for (const variant of variants) {
      for (const psm of modes) {
        try {
          await worker.setParameters({ tessedit_pageseg_mode: psm });
          const { data } = await worker.recognize(variant);
          const block = (data.text || "").trim();
          if (!block) continue;
          const sc = latinTextScore(block);
          if (sc > bestScore) {
            bestScore = sc;
            best = block;
          }
        } catch (e) {
          lastErr = e;
        }
      }
    }
  }

  return { text: best, lastErr };
}

/**
 * @param tesseractLanguages Tesseract の言語指定（例: `eng` は英作文向け、`jpn+eng` は日英混在の課題文向け）
 */
export async function ocrImageFilesEng(
  files: File[],
  onProgress?: (message: string) => void,
  tesseractLanguages: string = "jpn+eng",
): Promise<string> {
  if (files.length === 0) return "";
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker(tesseractLanguages);
  const parts: string[] = [];
  try {
    if (tesseractLanguages === "eng") {
      // 英作文欄のフォールバック OCR は英字中心に制約して、誤認識を減らす。
      await worker.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:'\"()[]{}-_/\\@#$%&*+=<>`~\n\r\t",
      });
    }
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      onProgress?.(`画像を読み取り中 (${i + 1}/${files.length})…`);
      let pngFromBitmap = await decodeImageFileToPngBlob(file);
      let jpegFromHeic: Blob | null = null;
      if (!pngFromBitmap) {
        jpegFromHeic = await heicToJpegBlob(file);
      }
      let pngFromHeicJpeg: Blob | null = null;
      if (jpegFromHeic) {
        pngFromHeicJpeg = await decodeImageFileToPngBlob(
          new File([jpegFromHeic], "heic-converted.jpg", { type: "image/jpeg" }),
        );
      }
      const tryOrder: (Blob | File)[] = [];
      for (const b of [pngFromBitmap, pngFromHeicJpeg, jpegFromHeic, file]) {
        if (b == null) continue;
        if (tryOrder.length && tryOrder[tryOrder.length - 1] === b) continue;
        tryOrder.push(b);
      }
      let lastErr: unknown;
      let recognized = false;

      if (tesseractLanguages === "eng") {
        const { text, lastErr: e2 } = await recognizeEngBestEffort(worker, PSM, tryOrder);
        lastErr = e2;
        if (text.trim()) {
          parts.push(text.trim());
          recognized = true;
        }
      }

      if (!recognized) {
        for (const src of tryOrder) {
          try {
            await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
            const { data } = await worker.recognize(src);
            const block = (data.text || "").trim();
            if (block) parts.push(block);
            recognized = true;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
      }

      if (!recognized) {
        const raw = lastErr instanceof Error ? lastErr.message : String(lastErr);
        if (isTesseractImageReadError(raw)) {
          throw new Error(ocrImageReadErrorJa(file.name || "（無題）"));
        }
        throw lastErr instanceof Error ? lastErr : new Error(raw);
      }
    }
  } finally {
    await worker.terminate();
  }
  return parts.join("\n\n").trim();
}

export async function extractTextFromPdfFile(file: File): Promise<string> {
  await configurePdfWorker();
  const { getDocument } = await import("pdfjs-dist");
  const buf = await file.arrayBuffer();
  const loadingTask = getDocument({ data: buf });
  const doc = await loadingTask.promise;
  try {
    const pageTexts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const textContent = await page.getTextContent();
      const line = textContent.items
        .map((item) => {
          if (item && typeof item === "object" && "str" in item) {
            return String((item as { str: string }).str);
          }
          return "";
        })
        .join(" ");
      const t = line.replace(/\s+/g, " ").trim();
      if (t) pageTexts.push(t);
    }
    return pageTexts.join("\n\n").trim();
  } finally {
    await doc.destroy();
  }
}

export type IngestFilesOptions = {
  /** 画像 OCR に使う Tesseract 言語。提出の英文は `eng`、課題文は `jpn+eng` 推奨 */
  tesseractLang?: string;
};

/** ドロップ順を保ち、連続する画像は1回の OCR にまとめる */
export async function ingestFilesInOrder(
  files: File[],
  onProgress?: (message: string) => void,
  options?: IngestFilesOptions,
): Promise<string> {
  const lang = (options?.tesseractLang ?? "jpn+eng").trim() || "jpn+eng";
  const parts: string[] = [];
  let imageBatch: File[] = [];

  const flushImages = async () => {
    if (imageBatch.length === 0) return;
    const t = await ocrImageFilesEng(imageBatch, onProgress, lang);
    if (t) parts.push(t);
    imageBatch = [];
  };

  for (const file of files) {
    if (isLikelyUnsupportedOffice(file)) {
      throw new Error(`未対応の形式です（${file.name}）。Word / Excel は PDF または画像に変換してください。`);
    }
    if (isImageFile(file)) {
      imageBatch.push(file);
      continue;
    }
    await flushImages();
    onProgress?.(`取り込み中: ${file.name}`);
    if (isPdfFile(file)) {
      const t = await extractTextFromPdfFile(file);
      if (t) parts.push(t);
    } else {
      const raw = (await readFileAsText(file)).trim();
      if (raw) parts.push(raw);
    }
  }
  await flushImages();
  return parts.join("\n\n---\n\n").trim();
}
