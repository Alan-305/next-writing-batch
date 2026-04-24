/** サーバー・クライアントで同じ見え方にする（ハイドレーションずれ対策） */
const jaTokyo = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatDateTimeIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return jaTokyo.format(d);
}

export function formatDateTimeMs(ms: number): string {
  return jaTokyo.format(new Date(ms));
}
