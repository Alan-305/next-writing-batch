import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

/**
 * 一時ファイルに全文を書いてから置き換えることで、
 * 書き込み途中に別プロセスが JSON を読んで壊れたオブジェクトになるのを避ける。
 * 異常終了時は `*.tmp` が残ることがある（手で削除してよい）。
 */
export async function writeJsonFileAtomic(filePath: string, value: unknown, indent = 2): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const body = `${JSON.stringify(value, null, indent)}\n`;
  const tmp = path.join(dir, `${path.basename(filePath)}.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, body, "utf8");
  try {
    await fs.rename(tmp, filePath);
  } catch {
    await fs.copyFile(tmp, filePath);
    await fs.unlink(tmp).catch(() => {});
  }
}
