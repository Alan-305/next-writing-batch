import { runEssayHandwritingIngestClaude, type EssayHandwritingClaudePart } from "@/lib/essay-handwriting-claude";
import { runEssayHandwritingIngestGemini } from "@/lib/essay-handwriting-gemini";

export type EssayHandwritingPart = EssayHandwritingClaudePart;

export type EssayHandwritingIngestResult = {
  text: string;
  provider: "claude" | "gemini";
  /** Claude を試したあと Gemini に切り替えた場合 true */
  usedFallback: boolean;
};

export function essayOcrProviderMode(): "claude-first" | "gemini-only" {
  const v = (process.env.ESSAY_OCR_PROVIDER || "gemini-only").trim().toLowerCase();
  if (v === "claude" || v === "claude-first") return "claude-first";
  return "gemini-only";
}

/**
 * 手書き英文 OCR: 既定は Gemini のみ（速さ優先）。Claude キーは添削専用。
 * ESSAY_OCR_PROVIDER=claude-first で旧来の Claude → Gemini フォールバック。
 */
export async function runEssayHandwritingIngest(opts: {
  parts: EssayHandwritingPart[];
  claudeApiKey?: string;
  geminiApiKey?: string;
}): Promise<EssayHandwritingIngestResult> {
  const claudeKey = (opts.claudeApiKey || "").trim();
  const geminiKey = (opts.geminiApiKey || "").trim();
  const mode = essayOcrProviderMode();

  if (mode === "gemini-only" && !geminiKey) {
    throw new Error(
      "手書き OCR 用の GEMINI_API_KEY（または GOOGLE_API_KEY）が未設定です。運用の「Gemini API キー」画面または Cloud Run の環境変数で設定してください。",
    );
  }

  if (!claudeKey && !geminiKey) {
    throw new Error(
      "Claude / Gemini API キーがどちらも未設定です。OCR には GEMINI_API_KEY、添削には NEXT_WRITING_BATCH_KEY を設定してください。",
    );
  }

  let claudeError: string | null = null;

  if (mode === "claude-first" && claudeKey) {
    try {
      const text = await runEssayHandwritingIngestClaude({ apiKey: claudeKey, parts: opts.parts });
      if (text.trim()) {
        return { text: text.trim(), provider: "claude", usedFallback: false };
      }
      claudeError = "Claude OCR が空の結果を返しました。";
    } catch (e) {
      claudeError = e instanceof Error ? e.message : String(e);
    }
  }

  if (!geminiKey) {
    throw new Error(
      claudeError
        ? `${claudeError}（Gemini フォールバック不可: GEMINI_API_KEY 未設定）`
        : "GEMINI_API_KEY（または GOOGLE_API_KEY）が未設定です。",
    );
  }

  try {
    const text = await runEssayHandwritingIngestGemini({ apiKey: geminiKey, parts: opts.parts });
    if (!text.trim()) {
      throw new Error("Gemini OCR が空の結果を返しました。画像の鮮明さを確認してください。");
    }
    return {
      text: text.trim(),
      provider: "gemini",
      usedFallback: Boolean(claudeError),
    };
  } catch (e) {
    const geminiErr = e instanceof Error ? e.message : String(e);
    if (claudeError) {
      throw new Error(`Claude: ${claudeError} / Gemini: ${geminiErr}`);
    }
    throw e instanceof Error ? e : new Error(geminiErr);
  }
}
