/** 課題プルダウンと同じ表示（taskId — displayLabel） */
export function formatRegisteredTaskDropdownLabel(taskId: string, displayLabel: string): string {
  const tid = taskId.trim();
  const label = displayLabel.trim();
  if (!tid) return label || "—";
  if (!label || label === tid) return tid;
  return `${tid} — ${label}`;
}
