import type { TFunction } from "i18next";

import type { UserAccount } from "../types";

export type UserStatus = "active" | "unverified" | "pending" | "banned";

const USER_STATUS_LABEL_KEYS: Record<UserStatus, string> = {
  active: "admin:users.filters.active",
  unverified: "settings:account.email.unverified",
  pending: "admin:users.shared.status.pending",
  banned: "admin:users.shared.status.banned",
};

export function getUserStatus(account: Pick<UserAccount, "isBanned" | "isPendingApproval" | "isEmailVerified">): UserStatus {
  if (account.isBanned) return "banned";
  if (account.isPendingApproval) return "pending";
  return account.isEmailVerified ? "active" : "unverified";
}

export function getUserStatusLabel(t: TFunction, status: UserStatus): string {
  return t(USER_STATUS_LABEL_KEYS[status]);
}
