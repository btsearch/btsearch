import { SI2PEM_ENDPOINTS, si2pemDateToISO } from "si2pem-reader";

const SI2PEM_HOSTNAME = new URL(SI2PEM_ENDPOINTS.origin).hostname;
const POLISH_DATE_TIME_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/;
const WARSAW_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Warsaw",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function getWarsawOffsetMs(instant: number): number {
  const parts = WARSAW_TIME_FORMAT.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - instant;
}

export function warsawDateTimeToISO(value: string | null | undefined): string | null {
  const match = value ? POLISH_DATE_TIME_PATTERN.exec(value.trim()) : null;
  if (!match) return si2pemDateToISO(value);
  const [, day, month, year, hour, minute, second] = match;
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const firstGuess = wallClock - getWarsawOffsetMs(wallClock);
  const instant = new Date(wallClock - getWarsawOffsetMs(firstGuess));
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function si2pemDateToCalendarDate(value: string | null | undefined): string | null {
  return si2pemDateToISO(value)?.slice(0, 10) ?? null;
}

export function toSI2PEMFileUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !URL.canParse(trimmed, SI2PEM_ENDPOINTS.origin)) return null;
  const url = new URL(trimmed, SI2PEM_ENDPOINTS.origin);
  const hostname = url.hostname.toLowerCase();
  const isSI2PEMHost = hostname === SI2PEM_HOSTNAME || hostname.endsWith(`.${SI2PEM_HOSTNAME}`);
  if (!isSI2PEMHost || (url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
  url.protocol = "https:";
  return url.href;
}
