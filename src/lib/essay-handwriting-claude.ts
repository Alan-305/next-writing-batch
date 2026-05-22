export type EssayHandwritingClaudePart = { mimeType: string; data: Uint8Array };

type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

function isPdf(mimeType: string): boolean {
  return (mimeType || "").toLowerCase() === "application/pdf";
}

function stripWrapper(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\r\n/g, "\n").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableClaudeError(status: number, message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    status === 529 ||
    status === 503 ||
    status === 429 ||
    m.includes("overloaded") ||
    m.includes("rate_limit") ||
    m.includes("rate limit")
  );
}

function skipOcrRefinePass(): boolean {
  const v = (process.env.CLAUDE_OCR_SKIP_REFINE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function buildBasePrompt(): string {
  return [
    "あなたは英語学習者の手書き英文を高精度で転記するOCRアシスタントです。",
    "与えられた画像やPDFの内容を、そのまま英語答案として転記してください。",
    "厳守:",
    "- 出力は転記結果のみ（前置き・説明・注釈は禁止）。",
    "- 勝手な修正や補完はしない。",
    "- 判読不能な箇所は [illegible] と記す。",
    "- 行分け・段落・記号は原文にできるだけ合わせる。",
    "- 単語が不自然に分断されている場合は、原文の意図が明確なら自然な単語境界に直してよい（内容改変は不可）。",
  ].join("\n");
}

function buildRefinePrompt(firstPassText: string): string {
  return [
    "以下は同じ画像/PDFから得た一次転記です。誤読を減らすため、画像/PDFを再確認して転記を改善してください。",
    "厳守:",
    "- 画像/PDFに書かれている内容だけを転記する（推測で加筆しない）。",
    "- 出力は最終転記テキストのみ（説明禁止）。",
    "- 明らかなOCR由来の文字化け・分断語・意味不明語を、画像上の筆跡に基づいて修正する。",
    "- 判読不能箇所は [illegible] を残す。",
    "",
    "一次転記:",
    firstPassText || "[empty]",
  ].join("\n");
}

/**
 * 手書き英文の転記専用（提出フォーム向け）。
 */
export async function runEssayHandwritingIngestClaude(opts: {
  apiKey: string;
  model?: string;
  parts: EssayHandwritingClaudePart[];
}): Promise<string> {
  if (!opts.parts.length) {
    throw new Error("読み取るファイルがありません。");
  }

  const model = (opts.model || process.env.CLAUDE_OCR_MODEL || process.env.CLAUDE_MODEL || "").trim();
  if (!model) {
    throw new Error("Claude OCR model is not configured. Set CLAUDE_OCR_MODEL or CLAUDE_MODEL.");
  }
  const mediaBlocks: ClaudeContentBlock[] = [];

  for (const p of opts.parts) {
    const encoded = Buffer.from(p.data).toString("base64");
    if (isPdf(p.mimeType)) {
      mediaBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: encoded,
        },
      });
      continue;
    }
    mediaBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: p.mimeType,
        data: encoded,
      },
    });
  }

  const maxAttempts = Math.max(1, Math.min(6, Number(process.env.CLAUDE_OCR_MAX_RETRIES) || 5));

  async function callClaudeOnce(content: ClaudeContentBlock[]): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4500,
        temperature: 0,
        messages: [{ role: "user", content }],
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      error?: { type?: string; message?: string };
      content?: Array<{ type?: string; text?: string }>;
    };

    if (!response.ok) {
      const msg = data?.error?.message || `Claude API failed: ${response.status}`;
      const err = new Error(msg) as Error & { status?: number; retryable?: boolean };
      err.status = response.status;
      err.retryable = isRetryableClaudeError(response.status, msg);
      throw err;
    }

    return (data.content || [])
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text || "")
      .join("\n")
      .trim();
  }

  async function callClaude(content: ClaudeContentBlock[]): Promise<string> {
    let lastErr: (Error & { status?: number; retryable?: boolean }) | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await callClaudeOnce(content);
      } catch (e) {
        const err = e as Error & { status?: number; retryable?: boolean };
        lastErr = err;
        const retryable = err.retryable ?? isRetryableClaudeError(err.status ?? 0, err.message);
        if (!retryable || attempt >= maxAttempts - 1) {
          throw err;
        }
        await sleep(2000 * 2 ** attempt);
      }
    }
    throw lastErr ?? new Error("Claude OCR failed");
  }

  const firstPass = await callClaude([{ type: "text", text: buildBasePrompt() }, ...mediaBlocks]);
  if (skipOcrRefinePass()) {
    return stripWrapper(firstPass);
  }

  try {
    const refined = await callClaude([
      { type: "text", text: buildRefinePrompt(firstPass) },
      ...mediaBlocks,
    ]);
    return stripWrapper(refined || firstPass);
  } catch (e) {
    const err = e as Error & { retryable?: boolean };
    if (firstPass.trim() && (err.retryable ?? isRetryableClaudeError(0, err.message))) {
      return stripWrapper(firstPass);
    }
    throw e;
  }
}
