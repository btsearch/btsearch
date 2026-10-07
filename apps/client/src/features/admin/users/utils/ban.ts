import type { TFunction } from "i18next";

import type { UserAccount } from "../types";
import { formatFullDate, formatShortDate } from "@/lib/format";

const DAY_SECONDS = 60 * 60 * 24;
const LIBRARY_DEFAULT_BAN_REASON = "No reason";

export const BAN_DURATIONS = [
  { id: "day", seconds: DAY_SECONDS },
  { id: "week", seconds: 7 * DAY_SECONDS },
  { id: "month", seconds: 30 * DAY_SECONDS },
  { id: "permanent", seconds: null },
] as const;

export type BanDurationId = (typeof BAN_DURATIONS)[number]["id"];
type BanDateLength = "short" | "long";

export function isBanInForce(isMarkedBanned: boolean, banExpiresAt: string | null, now: Date): boolean {
  if (!isMarkedBanned) return false;
  return banExpiresAt === null || new Date(banExpiresAt).getTime() > now.getTime();
}

export function getBanDurationSeconds(durationId: BanDurationId): number | null {
  return BAN_DURATIONS.find((duration) => duration.id === durationId)?.seconds ?? null;
}

export function getBanDurationLabel(t: TFunction, durationId: BanDurationId): string {
  return t(`admin:users.shared.ban.durations.${durationId}`);
}

export function computeBanExpiresAt(durationId: BanDurationId, bannedAt: Date): string | null {
  const seconds = getBanDurationSeconds(durationId);
  return seconds === null ? null : new Date(bannedAt.getTime() + seconds * 1000).toISOString();
}

export function formatBanExpiry(banExpiresAt: string, language: string, length: BanDateLength): string {
  return length === "short" ? formatShortDate(banExpiresAt, language) : formatFullDate(banExpiresAt, language);
}

export function getBanUntilLabel(t: TFunction, language: string, banExpiresAt: string | null, length: BanDateLength): string {
  if (banExpiresAt === null) return t("admin:users.shared.ban.permanent");
  return t("admin:users.shared.ban.until", { date: formatBanExpiry(banExpiresAt, language, length) });
}

export function getBanUntilSentence(t: TFunction, language: string, banExpiresAt: string | null): string {
  if (banExpiresAt === null) return t("admin:users.shared.ban.durations.permanent");
  return t("admin:users.shared.ban.untilSentence", { date: formatBanExpiry(banExpiresAt, language, "long") });
}

export function readBanReason(banReason: string | null): string | null {
  const reason = banReason?.trim() ?? "";
  return reason === "" || reason === LIBRARY_DEFAULT_BAN_REASON ? null : reason;
}

export function getBanReasonLabel(t: TFunction, banReason: string | null): string {
  return t("admin:users.shared.ban.reason", { reason: readBanReason(banReason) ?? t("admin:users.shared.ban.noReason") });
}

export function getBanSummary(t: TFunction, language: string, ban: Pick<UserAccount, "banReason" | "banExpiresAt">): string {
  return t("admin:users.shared.ban.summary", {
    reason: getBanReasonLabel(t, ban.banReason),
    until: getBanUntilSentence(t, language, ban.banExpiresAt),
  });
}
