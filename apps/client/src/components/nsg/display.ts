import i18n from "@/i18n/config";

export { formatFileSize as formatBytes, formatDuration } from "@/lib/format";

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const MISSING_NUMERIC_VALUES = new Set([2_147_483_647, Number("9223372036854775807")]);
const MISSING_TEXT_VALUES = new Set(["2147483647", "9223372036854775807"]);

export function formatTime(timestamp: number | null | undefined, includeDate = false): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return "-";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "-";
  const key = i18n.language + (includeDate ? ":date" : ":time");
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(i18n.language || undefined, {
      ...(includeDate ? { dateStyle: "medium" as const } : {}),
      timeStyle: "medium",
      hourCycle: "h23",
    });
    timeFormatters.set(key, formatter);
  }
  return formatter.format(date);
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isFinite(value) && !MISSING_NUMERIC_VALUES.has(value) ? String(value) : "-";
  if (typeof value === "string") return MISSING_TEXT_VALUES.has(value) ? "-" : value;
  if (typeof value === "boolean") return String(value);
  return JSON.stringify(value) ?? "-";
}
