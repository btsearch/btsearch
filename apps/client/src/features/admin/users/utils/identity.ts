import type { AdminUser, UserRef } from "../types";

const UPLOADED_AVATAR_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isUploadedAvatar(image: string | null): boolean {
  return image !== null && UPLOADED_AVATAR_PATTERN.test(image);
}

export function resolveDisplayName(user: Pick<UserRef, "name" | "username">): string {
  return user.name || user.username || "";
}

export function getAccountName(account: Pick<AdminUser, "name" | "email">): string {
  return account.name || account.email;
}
