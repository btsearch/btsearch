import type { TFunction } from "i18next";

export function resolveAvatarUrl(image: string | null | undefined): string | undefined {
  if (!image) return undefined;
  if (image.startsWith("http")) return image;
  return `/uploads/${image}`;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatRelativeTime(dateString: string, t: TFunction): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffYears > 0) return t("time.yearsAgo", { count: diffYears });
  if (diffMonths > 0) return t("time.monthsAgo", { count: diffMonths });
  if (diffWeeks > 0) return t("time.weeksAgo", { count: diffWeeks });
  if (diffDays > 0) return t("time.daysAgo", { count: diffDays });
  if (diffHours > 0) return t("time.hoursAgo", { count: diffHours });
  if (diffMinutes > 0) return t("time.minutesAgo", { count: diffMinutes });
  return t("time.justNow");
}

export function formatFullDate(dateString: string, locale: string): string {
  return new Date(dateString).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortDate(dateString: string | null, locale: string): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMonthYear(date: string | Date, locale: string, month: "short" | "long"): string {
  return new Date(date).toLocaleDateString(locale, { year: "numeric", month });
}

export function formatDayMonthYear(dateString: string | null): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getUTCFullYear()}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[index]}`;
}

const EXPANDED_IPV6 = /^[\da-f]{1,4}(?::[\da-f]{1,4}){7}$/i;

function compressIpv6(ip: string): string {
  const groups = ip.split(":").map((group) => Number.parseInt(group, 16).toString(16));
  let runStart = -1;
  let runLength = 1;
  for (let start = 0; start < groups.length; start++) {
    let end = start;
    while (groups[end] === "0") end++;
    if (end - start > runLength) {
      runStart = start;
      runLength = end - start;
    }
  }

  if (runStart === -1) return groups.join(":");
  return `${groups.slice(0, runStart).join(":")}::${groups.slice(runStart + runLength).join(":")}`;
}

export function formatIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const formatted = EXPANDED_IPV6.test(ip) ? compressIpv6(ip) : ip;
  return formatted === "::" || formatted === "0.0.0.0" ? null : formatted;
}
