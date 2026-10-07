import type { TFunction } from "i18next";

import type { UserRole } from "../types";

export const USER_ROLES = ["user", "editor", "admin"] as const satisfies readonly UserRole[];

export function toUserRole(value: unknown): UserRole {
  return USER_ROLES.find((role) => role === value) ?? "user";
}

export function getUserRoleLabel(t: TFunction, role: UserRole): string {
  if (role === "user") return t("admin:users.filters.roleUser");
  return t(`common:roles.${role}`);
}
