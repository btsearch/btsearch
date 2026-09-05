import i18n from "@/i18n/config";

export { formatFileSize as formatBytes, formatDuration } from "@/lib/format";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const MISSING_NUMERIC_VALUES = new Set([2_147_483_647, Number("9223372036854775807")]);
const MISSING_TEXT_VALUES = new Set(["2147483647", "9223372036854775807"]);

function getTimeFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let formatter = timeFormatters.get(key);
  if (formatter) return formatter;

  formatter = new Intl.DateTimeFormat(i18n.language || undefined, options);
  timeFormatters.set(key, formatter);
  return formatter;
}

export function formatTime(timestamp: number | null | undefined, includeDate = false): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return "-";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "-";
  const key = i18n.language + (includeDate ? ":date" : ":time");
  const formatter = getTimeFormatter(key, {
    ...(includeDate ? { dateStyle: "medium" as const } : {}),
    timeStyle: "medium",
    hourCycle: "h23",
  });
  return formatter.format(date);
}

export function formatTimeWithMilliseconds(timestamp: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "-";
  const key = `${i18n.language}:time:milliseconds`;
  const formatter = getTimeFormatter(key, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  });
  return formatter.format(date);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) && !MISSING_NUMERIC_VALUES.has(value) ? String(value) : "-";
  if (typeof value === "string") return MISSING_TEXT_VALUES.has(value) ? "-" : value;
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "-";
}

export function formatDecibelValue(value: unknown): string {
  const formatted = formatValue(value);
  return typeof value === "number" && formatted !== "-" ? value.toFixed(1) : formatted;
}
