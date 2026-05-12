import fs from "fs";
import path from "path";

/** Cloud Run / Secret Manager / `.env.local` では `NEXT_WRITING_BATCH_KEY` */
export function anthropicApiKeyFromProcessEnv(): string {
  return (process.env.NEXT_WRITING_BATCH_KEY || "").trim();
}

/** リポジトリ内に保存（.gitignore 対象）。環境変数が無いときのフォールバック */
export function anthropicApiKeyFilePath(): string {
  return path.join(process.cwd(), "data", "anthropic_api_key.txt");
}

export function readAnthropicApiKeyFromDisk(): string {
  const fp = anthropicApiKeyFilePath();
  try {
    if (!fs.existsSync(fp)) return "";
    const first = fs.readFileSync(fp, "utf8").split(/\r?\n/)[0];
    return (first ?? "").trim();
  } catch {
    return "";
  }
}

/** 環境変数を優先し、無ければ保存ファイルの1行目 */
export function resolveEffectiveAnthropicApiKey(): string {
  const fromEnv = anthropicApiKeyFromProcessEnv();
  if (fromEnv) return fromEnv;
  return readAnthropicApiKeyFromDisk();
}

export type AnthropicKeySource = "env" | "file" | "none";

export function describeAnthropicKeySource(): { configured: boolean; source: AnthropicKeySource } {
  const env = anthropicApiKeyFromProcessEnv();
  if (env) return { configured: true, source: "env" };
  const f = readAnthropicApiKeyFromDisk();
  if (f) return { configured: true, source: "file" };
  return { configured: false, source: "none" };
}

/** API ルートからのみ呼ぶ。平文保存のためリポジトリにコミットしないこと */
export function writeAnthropicApiKeyToDisk(apiKey: string): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("キーが空です。");
  }
  if (trimmed.length > 2048) {
    throw new Error("キーが長すぎます。");
  }
  const fp = anthropicApiKeyFilePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, `${trimmed}\n`, { encoding: "utf8", mode: 0o600 });
}

export function clearAnthropicApiKeyFile(): void {
  const fp = anthropicApiKeyFilePath();
  try {
    fs.unlinkSync(fp);
  } catch {
    /* なくてもよい */
  }
}
