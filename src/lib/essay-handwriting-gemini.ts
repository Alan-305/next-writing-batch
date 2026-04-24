import { GoogleGenerativeAI } from "@google/generative-ai";

// まずは速度優先のモデルを使い、必要時のみフォールバックする。
const DEFAULT_MODEL = "models/gemini-flash-latest";
const DEFAULT_FALLBACK_MODELS = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-flash-lite",
  "models/gemini-2.5-flash-image",
] as const;

/** 手書き英文の転記専用（問題文用プロンプトとは別） */
const ESSAY_HANDWRITING_PROMPT =
  "あなたは英語学習者の手書き英文をテキスト化します。次の画像または PDF（複数あるときは渡された順＝ページ順）に書かれた内容を、英語の答案としてそのまま書き写してください。\n\n" +
  "厳守:\n" +
  "- 出力は転記した英文（および文中の数字・記号）のみ。前置き・後書き・説明は禁止。\n" +
  "- 解答が英語で書かれている場合、英字として読める箇所を優先して転記する。英字を日本語かな・漢字・記号に置き換えない。\n" +
  "- 文字が曖昧な場合は、勝手に別の単語へ補正せず [illegible] を使う（誤推定で別単語にしない）。\n" +
  "- 日本語への翻訳・要約・表現の添削・誤字の勝手な修正はしない。\n" +
  "- 段落の区切りは、用紙上の改行に近い形で空行をはさんでよい。\n" +
  "- 判読不能な語はその位置だけ [illegible] とする。推測で穴埋めしない。\n" +
  "- Markdown の見出しや箇条書きは使わない（答案が明らかに箇条書きのときだけそのまま行を分ける）。\n";

export type EssayHandwritingGeminiPart = { mimeType: string; data: Uint8Array };

function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*/g, "").trim();
}

function englishLikeScore(text: string): number {
  const t = (text || "").trim();
  if (!t) return -9999;
  const compact = t.replace(/\s+/g, "");
  if (!compact) return -9999;

  let score = 0;
  for (const ch of compact) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) score += 1.0; // A-Z a-z
    else if (c >= 48 && c <= 57) score += 0.2; // 0-9
    else if ("'\",-.!?;:()[]{}_/\\@#$%&*+=<>`~".includes(ch)) score += 0.12;
    else if (c <= 0x7f) score += 0.04;
    else if (c >= 0x3040 && c <= 0x9fff) score -= 0.9; // JP chars are strong negative for English essay OCR
    else score -= 0.35;
  }

  // [illegible] が多すぎる場合は品質低めとみなす
  const illegibleCount = (t.match(/\[illegible\]/gi) || []).length;
  score -= illegibleCount * 1.2;

  return score / compact.length;
}

function modelCandidates(explicitModel?: string): string[] {
  const preferred = (explicitModel || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const fallbackFromEnv = (process.env.GEMINI_MODEL_FALLBACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = fallbackFromEnv.length > 0 ? fallbackFromEnv : [...DEFAULT_FALLBACK_MODELS];
  return Array.from(new Set([preferred, ...fallback]));
}

const FAST_ACCEPT_SCORE = 0.68;

export async function runEssayHandwritingIngestGemini(opts: {
  apiKey: string;
  model?: string;
  parts: EssayHandwritingGeminiPart[];
}): Promise<string> {
  if (opts.parts.length === 0) {
    throw new Error("読み取るファイルがありません。");
  }

  const candidates = modelCandidates(opts.model);
  const genAI = new GoogleGenerativeAI(opts.apiKey);
  const errors: string[] = [];
  let bestText = "";
  let bestScore = -9999;

  const payload: (string | { inlineData: { mimeType: string; data: string } })[] = [ESSAY_HANDWRITING_PROMPT];
  for (const p of opts.parts) {
    payload.push({
      inlineData: {
        mimeType: p.mimeType,
        data: Buffer.from(p.data).toString("base64"),
      },
    });
  }

  for (const [index, modelName] of candidates.entries()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0, topP: 0.9, topK: 20 },
      });
      const r = await model.generateContent(payload);
      const t = r.response.text();
      const cleaned = stripBoldMarkers(t || "");
      const score = englishLikeScore(cleaned);
      if (score > bestScore) {
        bestScore = score;
        bestText = cleaned;
      }
      // 速度優先: 先頭モデルで十分英語らしい結果が得られたら即返す。
      if ((index === 0 && score >= FAST_ACCEPT_SCORE) || score >= FAST_ACCEPT_SCORE + 0.08) {
        return cleaned;
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errors.push(`${modelName}: ${reason}`);
    }
    // 先頭成功済みで品質が最低限なら、残りモデルを回さず返して待ち時間を短縮。
    if (index === 0 && bestText.trim() && bestScore >= 0.52) {
      return bestText;
    }
  }

  if (bestText.trim()) {
    return bestText;
  }

  throw new Error(`essay_handwriting_gemini_failed: ${errors.join(" | ")}`);
}
