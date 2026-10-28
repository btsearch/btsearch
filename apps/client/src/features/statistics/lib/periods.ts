import type { StatisticsInterval } from "@openbts/shared/contract";

export type Granularity = "daily" | "monthly";
export type PeriodSpan = number | "all";
export type Period = { granularity: Granularity; span: PeriodSpan };

const DAY_LENGTH = 10;
const MONTH_LENGTH = 7;

export const INTERVALS: Record<Granularity, StatisticsInterval> = { daily: "day", monthly: "month" };
export const PERIOD_SPANS: Record<Granularity, readonly PeriodSpan[]> = { monthly: [12, 24, "all"], daily: [30, 90, 365] };

export function defaultPeriod(granularity: Granularity): Period {
  return { granularity, span: PERIOD_SPANS[granularity][0] };
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, DAY_LENGTH);
}

export function toMonth(date: Date): string {
  return date.toISOString().slice(0, MONTH_LENGTH);
}

export function currentMonth(): string {
  return toMonth(new Date());
}

export function toMonthStart(month: string): string {
  return `${month}-01`;
}

export function toPeriodKey(day: string, interval: StatisticsInterval): string {
  return interval === "month" ? day.slice(0, MONTH_LENGTH) : day;
}

export function findPeriodStart({ granularity, span }: Period, today: Date, earlierPeriods = 0): string | undefined {
  if (span === "all") return undefined;

  const periodsBack = span - 1 + earlierPeriods;
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  if (granularity === "monthly") return toDay(new Date(Date.UTC(year, month - periodsBack, 1)));
  return toDay(new Date(Date.UTC(year, month, today.getUTCDate() - periodsBack)));
}

export function toMonthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return toDay(new Date(Date.UTC(year, monthNumber, 0)));
}

export function toSnapshotRange(month: string): { takenAfter: string; takenBefore: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const previousMonthStart = new Date(Date.UTC(year, monthNumber - 2, 1));
  return { takenAfter: toDay(previousMonthStart), takenBefore: toMonthEnd(month) };
}
