/** 課題の目安語数（UI の成功メッセージ用） */
export const MAX_OFFICIAL_ESSAY_WORDS = 100;
/** 添削・提出を許可する英単語の上限 */
export const MAX_SYSTEM_ESSAY_WORDS = 150;

/**
 * 英文の「語数」として英字の連続（アポストロフィ内包）を数える。
 * 日本語の【(1)】などはカウントに含めない。
 */
export function countEnglishWords(text: string): number {
  const t = (text || "").trim();
  if (!t) return 0;
  const words = t.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return words ? words.length : 0;
}
