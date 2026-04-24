/** 課題マスタ・納品 ZIP 等のファイル名と一致させるための taskId 規約（英数字と ._- のみ） */
export const SAFE_TASK_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

const MAX_TASK_ID_LEN = 120;

/**
 * 保存・提出に使う課題IDの検証。問題なければ null。
 * 人間向けの日本語ラベルは `school_name` / `problem_memo`（マスタの設問タイトル）に分ける。
 */
export function validateTaskIdForStorage(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return "課題IDを入力してください。";
  }
  if (t.length > MAX_TASK_ID_LEN) {
    return `課題IDは${MAX_TASK_ID_LEN}文字以内にしてください。`;
  }
  if (!SAFE_TASK_ID_PATTERN.test(t)) {
    return "課題IDは半角の英数字と ._-（ドット・アンダースコア・ハイフン）のみにしてください。学校名・塾名・クラス名は「学校名」「問題メモ」に書くと、提出画面のリストに表示されます。";
  }
  return null;
}
