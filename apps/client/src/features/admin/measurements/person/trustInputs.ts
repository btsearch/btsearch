import type { TFunction } from "i18next";

import { BAN_DURATIONS } from "@/features/admin/users/utils/ban";
import { formatShortDate } from "@/lib/format";

type TrustDuration = { id: string; seconds: number | null };
type TrustGrant = { at: string; endsAt: string | null };

export const BLOCK_DURATIONS = BAN_DURATIONS;

const DAY_SECONDS = 60 * 60 * 24;
const TRUST_WEIGHT_MAX = 2;
const WEIGHT_INPUT_PATTERN = /^\d+(\.\d+)?$/;

export const VOUCH_DURATIONS = [
  { id: "month", seconds: 30 * DAY_SECONDS, labelKey: "admin:users.shared.ban.durations.month" },
  { id: "quarter", seconds: 90 * DAY_SECONDS, labelKey: "admin:measurements.person.vouchDialog.quarter" },
  { id: "year", seconds: 365 * DAY_SECONDS, labelKey: "admin:measurements.person.vouchDialog.year" },
  { id: "permanent", seconds: null, labelKey: "admin:users.shared.ban.durations.permanent" },
] as const;

export function parseTrustWeight(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!WEIGHT_INPUT_PATTERN.test(normalized)) return null;
  const value = Number(normalized);
  return value <= TRUST_WEIGHT_MAX ? value : null;
}

export function computeEndsAt(duration: TrustDuration, from: number): string | null {
  return duration.seconds === null ? null : new Date(from + duration.seconds * 1000).toISOString();
}

export function pickDuration<T extends TrustDuration>(durations: readonly T[], grant: TrustGrant | null, fallback: T): T {
  if (grant === null) return fallback;
  if (grant.endsAt === null) return durations.find((duration) => duration.seconds === null) ?? fallback;

  const grantedSeconds = (Date.parse(grant.endsAt) - Date.parse(grant.at)) / 1000;
  let closest = fallback;
  let closestGap = Number.POSITIVE_INFINITY;
  for (const duration of durations) {
    if (duration.seconds === null) continue;
    const gap = Math.abs(duration.seconds - grantedSeconds);
    if (gap < closestGap) {
      closest = duration;
      closestGap = gap;
    }
  }
  return closest;
}

export function getUntilSentence(t: TFunction, language: string, endsAt: string | null): string {
  if (endsAt === null) return t("admin:users.shared.ban.durations.permanent");
  return t("admin:users.shared.ban.untilSentence", { date: formatShortDate(endsAt, language) });
}
