import { GoogleGenerativeAI } from "@google/generative-ai";

import { PROBLEM_PLAIN_PROMPT, PROBLEM_STRUCTURED_INTRO } from "@/lib/nl-problem-ocr-prompts";

const DEFAULT_MODEL = "gemini-3.1-flash";
const DEFAULT_FALLBACK_MODELS = [
  "models/gemini-flash-latest",
  "gemini-2.5-flash",
  "models/gemini-2.5-flash",
  "models/gemini-2.5-flash-lite",
] as const;

function stripBoldMarkers(s: string): string {
  return s.replace(/\*\*/g, "").trim();
}

export type ProblemIngestGeminiPart = { mimeType: string; data: Uint8Array };

function modelCandidates(explicitModel?: string): string[] {
  const preferred = (explicitModel || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  const fallbackFromEnv = (process.env.GEMINI_MODEL_FALLBACKS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = fallbackFromEnv.length > 0 ? fallbackFromEnv : [...DEFAULT_FALLBACK_MODELS];
  return Array.from(new Set([preferred, ...fallback]));
}

export async function runProblemIngestGemini(opts: {
  apiKey: string;
  model?: string;
  mode: "plain" | "structured";
  parts: ProblemIngestGeminiPart[];
}): Promise<string> {
  if (opts.parts.length === 0) {
    throw new Error("読み取るファイルがありません。");
  }

  const candidates = modelCandidates(opts.model);
  const genAI = new GoogleGenerativeAI(opts.apiKey);
  const errors: string[] = [];

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0, topP: 0.9, topK: 20 },
      });

      if (opts.mode === "plain") {
        const one = opts.parts[0];
        const r = await model.generateContent([
          PROBLEM_PLAIN_PROMPT,
          {
            inlineData: {
              mimeType: one.mimeType,
              data: Buffer.from(one.data).toString("base64"),
            },
          },
        ]);
        const t = r.response.text();
        return stripBoldMarkers(t || "");
      }

      const payload: (string | { inlineData: { mimeType: string; data: string } })[] = [PROBLEM_STRUCTURED_INTRO];
      for (const p of opts.parts) {
        payload.push({
          inlineData: {
            mimeType: p.mimeType,
            data: Buffer.from(p.data).toString("base64"),
          },
        });
      }
      const r = await model.generateContent(payload);
      const t = r.response.text();
      return stripBoldMarkers(t || "");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      errors.push(`${modelName}: ${reason}`);
    }
  }

  throw new Error(`problem_ingest_gemini_failed: ${errors.join(" | ")}`);
}
