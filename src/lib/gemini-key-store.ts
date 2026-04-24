import fs from "fs";
import path from "path";

/** リポジトリ内に保存（.gitignore 対象）。環境変数が無いときのフォールバック */
export function geminiApiKeyFilePath(): string {
  return path.join(process.cwd(), "data", "gemini_api_key.txt");
}

export function readGeminiApiKeyFromDisk(): string {
  const fp = geminiApiKeyFilePath();
  try {
    if (!fs.existsSync(fp)) return "";
    const first = fs.readFileSync(fp, "utf8").split(/\r?\n/)[0];
    return (first ?? "").trim();
  } catch {
    return "";
  }
}

/** 環境変数を優先し、無ければ保存ファイルの1行目 */
export function resolveEffectiveGeminiApiKey(): string {
  const fromEnv = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  return readGeminiApiKeyFromDisk();
}

export type GeminiKeySource = "env" | "file" | "none";

export function describeGeminiKeySource(): { configured: boolean; source: GeminiKeySource } {
  const env = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (env) return { configured: true, source: "env" };
  const f = readGeminiApiKeyFromDisk();
  if (f) return { configured: true, source: "file" };
  return { configured: false, source: "none" };
}

/** API ルートからのみ呼ぶ。平文保存のためリポジトリにコミットしないこと */
export function writeGeminiApiKeyToDisk(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("キーが空です。");
  }
  if (trimmed.length > 2048) {
    throw new Error("キーが長すぎます。");
  }
  const fp = geminiApiKeyFilePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, `${trimmed}\n`, { encoding: "utf8", mode: 0o600 });
}

export function clearGeminiApiKeyFile(): void {
  const fp = geminiApiKeyFilePath();
  try {
    fs.unlinkSync(fp);
  } catch {
    /* なくてもよい */
  }
}
