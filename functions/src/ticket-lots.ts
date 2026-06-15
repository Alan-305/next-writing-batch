import type { BillingPlan } from "./runtime-config.js";
import { VALIDITY_DAYS_BY_PLAN } from "./runtime-config.js";

export type TicketLotKind = "free" | "paid" | "manual" | "legacy";

export type TicketLot = {
  count: number;
  expiresAt: string;
  kind: TicketLotKind;
  plan?: BillingPlan | string;
};

const LEGACY_FAR_FUTURE = "2099-12-31T23:59:59.999Z";

export function addDaysIso(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function lotKindRank(kind: TicketLotKind): number {
  if (kind === "free") return 0;
  if (kind === "legacy") return 2;
  return 1;
}

function parseLot(raw: unknown): TicketLot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const count = typeof o.count === "number" && Number.isFinite(o.count) ? Math.floor(o.count) : 0;
  const expiresAt = typeof o.expiresAt === "string" ? o.expiresAt.trim() : "";
  const kind = o.kind;
  if (count <= 0 || !expiresAt || !Date.parse(expiresAt)) return null;
  if (kind !== "free" && kind !== "paid" && kind !== "manual" && kind !== "legacy") return null;
  const plan = typeof o.plan === "string" && o.plan.trim() ? o.plan.trim() : undefined;
  return { count, expiresAt, kind, plan };
}

export function parseTicketLots(raw: unknown): TicketLot[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseLot).filter((lot): lot is TicketLot => lot !== null);
}

export function purgeExpiredLots(lots: TicketLot[], nowMs = Date.now()): TicketLot[] {
  return lots
    .map((lot) => ({ ...lot, count: Math.max(0, Math.floor(lot.count)) }))
    .filter((lot) => lot.count > 0 && Date.parse(lot.expiresAt) > nowMs);
}

export function sumTicketLots(lots: TicketLot[]): number {
  return lots.reduce((sum, lot) => sum + lot.count, 0);
}

export function migrateBillingToLots(billing: Record<string, unknown>, nowMs = Date.now()): TicketLot[] {
  const existing = purgeExpiredLots(parseTicketLots(billing.ticketLots), nowMs);
  if (existing.length > 0) return existing;
  const tickets =
    typeof billing.tickets === "number" && Number.isFinite(billing.tickets)
      ? Math.max(0, Math.floor(billing.tickets))
      : 0;
  if (tickets <= 0) return [];
  return [{ count: tickets, expiresAt: LEGACY_FAR_FUTURE, kind: "legacy" }];
}

export function grantTicketLot(
  lots: TicketLot[],
  grant: { count: number; validityDays: number; kind: TicketLotKind; plan?: BillingPlan | string },
  grantedAt = new Date(),
): TicketLot[] {
  const count = Math.max(0, Math.floor(grant.count));
  if (count <= 0) return lots;
  return [
    ...lots,
    {
      count,
      expiresAt: addDaysIso(grantedAt, grant.validityDays),
      kind: grant.kind,
      ...(grant.plan ? { plan: grant.plan } : {}),
    },
  ];
}

export function consumeTicketLots(
  lots: TicketLot[],
  amount: number,
): { lots: TicketLot[]; consumed: number } {
  const need = Math.max(0, Math.floor(amount));
  if (need <= 0) return { lots, consumed: 0 };

  const working = lots.map((lot) => ({ ...lot }));
  const order = working
    .map((lot, index) => ({ lot, index }))
    .sort((a, b) => {
      const rankDiff = lotKindRank(a.lot.kind) - lotKindRank(b.lot.kind);
      if (rankDiff !== 0) return rankDiff;
      return Date.parse(a.lot.expiresAt) - Date.parse(b.lot.expiresAt);
    });

  let remain = need;
  for (const { lot } of order) {
    if (remain <= 0) break;
    const take = Math.min(lot.count, remain);
    lot.count -= take;
    remain -= take;
  }

  const consumed = need - remain;
  return { lots: working.filter((lot) => lot.count > 0), consumed };
}

export function deductPaidTicketLots(
  lots: TicketLot[],
  amount: number,
): { lots: TicketLot[]; deducted: number } {
  const need = Math.max(0, Math.floor(amount));
  if (need <= 0) return { lots, deducted: 0 };

  const paidIndexes = lots
    .map((lot, index) => ({ lot, index }))
    .filter(({ lot }) => lot.kind === "paid" || lot.kind === "manual")
    .sort((a, b) => Date.parse(b.lot.expiresAt) - Date.parse(a.lot.expiresAt));

  const working = lots.map((lot) => ({ ...lot }));
  let remain = need;
  for (const { index } of paidIndexes) {
    if (remain <= 0) break;
    const lot = working[index];
    const take = Math.min(lot.count, remain);
    lot.count -= take;
    remain -= take;
  }

  const deducted = need - remain;
  return { lots: working.filter((lot) => lot.count > 0), deducted };
}

export function applyBillingLots(
  billing: Record<string, unknown>,
  lots: TicketLot[],
  nowMs = Date.now(),
): Record<string, unknown> {
  const purged = purgeExpiredLots(lots, nowMs);
  return {
    ...billing,
    ticketLots: purged,
    tickets: sumTicketLots(purged),
  };
}

export function resolveBillingTicketLots(
  billing: Record<string, unknown>,
  nowMs = Date.now(),
): { lots: TicketLot[]; changed: boolean } {
  const migrated = migrateBillingToLots(billing, nowMs);
  const purged = purgeExpiredLots(migrated, nowMs);
  const previousTotal =
    typeof billing.tickets === "number" && Number.isFinite(billing.tickets)
      ? Math.max(0, Math.floor(billing.tickets))
      : 0;
  const nextTotal = sumTicketLots(purged);
  const hadLots = parseTicketLots(billing.ticketLots).length > 0;
  const changed = nextTotal !== previousTotal || !hadLots;
  return { lots: purged, changed };
}

export function validityDaysForPlan(plan: BillingPlan): number {
  return VALIDITY_DAYS_BY_PLAN[plan];
}

const LEGACY_EXPIRY_CUTOFF_MS = Date.parse("2090-01-01T00:00:00.000Z");

export function nearestTicketExpiryIso(lots: TicketLot[], nowMs = Date.now()): string | null {
  const active = purgeExpiredLots(lots, nowMs).filter((lot) => lot.count > 0);
  if (active.length === 0) return null;

  let nearest: string | null = null;
  let nearestMs = Infinity;
  for (const lot of active) {
    const ms = Date.parse(lot.expiresAt);
    if (!Number.isFinite(ms) || ms >= LEGACY_EXPIRY_CUTOFF_MS) continue;
    if (ms < nearestMs) {
      nearestMs = ms;
      nearest = lot.expiresAt;
    }
  }
  return nearest;
}
