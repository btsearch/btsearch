const DAY_TIME_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
const WEIGHT_FORMAT: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const SHARE_FORMAT: Intl.NumberFormatOptions = { style: "percent", maximumFractionDigits: 1 };
const ROUNDED_SHARE_FORMAT: Intl.NumberFormatOptions = { style: "percent", maximumFractionDigits: 0 };

export function formatDayTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale, DAY_TIME_FORMAT);
}

export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale);
}

export function formatWeight(value: number, locale: string): string {
  return value.toLocaleString(locale, WEIGHT_FORMAT);
}

export function formatShare(value: number, locale: string): string {
  return value.toLocaleString(locale, SHARE_FORMAT);
}

export function formatSignedChange(ratio: number, locale: string): string {
  const rounded = Math.round(ratio * 100) / 100;
  const text = Math.abs(rounded).toLocaleString(locale, ROUNDED_SHARE_FORMAT);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `-${text}`;
  return text;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}
