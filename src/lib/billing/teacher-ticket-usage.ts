import type { Submission } from "@/lib/submissions-store";

export type Day4TicketChargeCounts = {
  /** 教員 UID ごとの確定公開（チケット消費）累計 */
  byUid: Map<string, number>;
  /** テナント全体の消費済み件数 */
  orgTotal: number;
  /** 消費者 UID が記録されていない過去分（複数教員テナントのみ） */
  unattributed: number;
};

/** Day4 確定でチケット消費済みの提出を教員別に集計する */
export function countDay4TicketsChargedByTeacher(
  submissions: Submission[],
  teacherUids: string[],
): Day4TicketChargeCounts {
  const teacherSet = new Set(teacherUids);
  const byUid = new Map<string, number>();
  for (const uid of teacherUids) byUid.set(uid, 0);

  const soleTeacher = teacherUids.length === 1 ? teacherUids[0] : null;
  let unattributed = 0;
  let orgTotal = 0;

  for (const s of submissions) {
    if (!String(s.day4TicketChargedAt ?? "").trim()) continue;
    orgTotal += 1;
    const fromUid = String(s.day4TicketChargedFromUid ?? "").trim();
    if (fromUid && teacherSet.has(fromUid)) {
      byUid.set(fromUid, (byUid.get(fromUid) ?? 0) + 1);
    } else if (soleTeacher) {
      byUid.set(soleTeacher, (byUid.get(soleTeacher) ?? 0) + 1);
    } else {
      unattributed += 1;
    }
  }

  return { byUid, orgTotal, unattributed };
}

export function readLifetimeTicketsConsumed(billing: Record<string, unknown>): number {
  const raw = billing["lifetimeTicketsConsumed"];
  return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}
