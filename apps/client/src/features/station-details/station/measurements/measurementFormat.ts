import type { CSSProperties } from "react";

import { getSectorColor } from "@/features/map/crowd/style/palette";
import { formatShortUtcDate } from "@/lib/format";

const KHZ_PER_MHZ = 1000;
const ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
const FIXED_DECIMAL: Intl.NumberFormatOptions = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
const DAY_MONTH_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };

export const SECTOR_COLOR_CLASS = "[--sector-color:var(--sector-color-light)] dark:[--sector-color:var(--sector-color-dark)]";

export function getSectorColorStyle(colorIndex: number): CSSProperties {
  return { "--sector-color-light": getSectorColor(colorIndex, "light"), "--sector-color-dark": getSectorColor(colorIndex, "dark") } as CSSProperties;
}

export function formatDecibels(value: number, language: string): string {
  return `${value.toLocaleString(language, FIXED_DECIMAL)} dB`;
}

export function formatBandwidth(bandwidthKhz: number, language: string): string {
  return `${(bandwidthKhz / KHZ_PER_MHZ).toLocaleString(language, ONE_DECIMAL)} MHz`;
}

export function formatDayMonth(day: string, language: string): string {
  return new Date(day).toLocaleDateString(language, DAY_MONTH_FORMAT);
}

export function formatDayRange(firstDay: string, lastDay: string, language: string): string {
  const last = formatShortUtcDate(lastDay, language);
  if (firstDay === lastDay) return last;
  const first = firstDay.slice(0, 4) === lastDay.slice(0, 4) ? formatDayMonth(firstDay, language) : formatShortUtcDate(firstDay, language);
  return `${first} - ${last}`;
}
