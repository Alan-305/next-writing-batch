import {
  formatTicketExpiryJa,
  nearestTicketExpiryIso,
  resolveBillingTicketLots,
  sumTicketLots,
} from "@/lib/billing/ticket-lots";

export type TeacherTicketStatus = {
  tickets: number;
  nearestExpiryIso: string | null;
  /** 有効チケットがなく添削確定できない */
  isExpired: boolean;
  /** 直近失効までの日数（切れ済み・legacy は null） */
  daysUntilExpiry: number | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function resolveTeacherTicketStatus(
  billing: Record<string, unknown> | undefined | null,
  nowMs = Date.now(),
): TeacherTicketStatus {
  const { lots } = resolveBillingTicketLots(billing ?? {}, nowMs);
  const tickets = sumTicketLots(lots);
  const nearestExpiryIso = tickets > 0 ? nearestTicketExpiryIso(lots, nowMs) : null;
  const isExpired = tickets <= 0;

  let daysUntilExpiry: number | null = null;
  if (nearestExpiryIso) {
    const expiryMs = Date.parse(nearestExpiryIso);
    if (Number.isFinite(expiryMs)) {
      daysUntilExpiry = Math.ceil((expiryMs - nowMs) / MS_PER_DAY);
      if (daysUntilExpiry < 0) daysUntilExpiry = 0;
    }
  }

  return { tickets, nearestExpiryIso, isExpired, daysUntilExpiry };
}

export function formatTeacherTicketExpiryLabel(iso: string | null): string {
  if (!iso) return "—";
  return formatTicketExpiryJa(iso);
}
