import { randomBytes } from "node:crypto";

const REDEEM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

/** 引換ID（推測困難な英数字 10 文字） */
export function generateRedeemId(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += REDEEM_ALPHABET[bytes[i]! % REDEEM_ALPHABET.length];
  }
  return out;
}

const AUTO_NICK_ADJECTIVES = ["青", "白", "赤", "緑", "黄", "月", "星", "風", "海", "空"];
const AUTO_NICK_NOUNS = ["猫", "犬", "鳥", "魚", "雲", "石", "木", "花", "叶", "波"];

/** ニックネーム未入力時のアプリ自動表示名 */
export function generateAutoDisplayNick(): string {
  const a = AUTO_NICK_ADJECTIVES[randomBytes(1)[0]! % AUTO_NICK_ADJECTIVES.length];
  const n = AUTO_NICK_NOUNS[randomBytes(1)[0]! % AUTO_NICK_NOUNS.length];
  const suffix = randomBytes(2).readUInt16BE(0) % 10000;
  return `${a}${n}_${String(suffix).padStart(4, "0")}`;
}

export function normalizeRedeemLookupToken(raw: string): string {
  return (raw ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeStudentNicknameInput(raw: string): string {
  const t = normalizeRedeemLookupToken(raw);
  if (!t) return "";
  return t.slice(0, 24);
}
