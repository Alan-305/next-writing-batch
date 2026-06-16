/** 日替わり演出用の前向きな一言 */
export const DAILY_ENCOURAGEMENT_MESSAGES = [
  "今日も一歩、前に進みましょう。",
  "小さな積み重ねが、大きな力になります。",
  "あなたの努力は、きっと実を結びます。",
  "今日という日を、自分のペースで大切に。",
  "挑戦する気持ちが、いちばんの武器です。",
  "間違いは学びのチャンス。恐れずに進もう。",
  "続けること自体が、すでに立派な成果です。",
  "今の一題が、未来の自分をつくります。",
  "深呼吸して、いつもの力を出しましょう。",
  "今日も英語と向き合えた自分を褒めてあげて。",
  "焦らなくて大丈夫。一歩ずつで十分です。",
  "先生も応援しています。一緒に頑張りましょう。",
] as const;

/** 高得点（満点の80％以上）のバルーン演出用 */
export const SCORE_ENCOURAGEMENT_MESSAGES = [
  "素晴らしい！この調子で続けましょう。",
  "よくできました。次もきっと伸びます。",
  "高い得点です。自信を持って次へ進もう。",
  "努力がしっかり結果につながっています。",
  "この出来栄えなら、次の課題も楽しみですね。",
  "英語力がぐっと上がっています。",
  "丁寧な学びが、点数に表れています。",
  "今日の自分に拍手！また一歩前進です。",
  "ここまでできたら、あとは積み重ねだけ。",
  "先生もきっと喜んでくれます。",
] as const;

export function pickRandomMessage(pool: readonly string[]): string {
  if (pool.length === 0) return "";
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0];
}

export function pickMessageBySeed(pool: readonly string[], seed: string): string {
  if (pool.length === 0) return "";
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[h % pool.length] ?? pool[0];
}
