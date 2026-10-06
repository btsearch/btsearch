import { resolveDisplayName } from "../utils/identity";
import type { PickerUser } from "./api";

export function getPickerUserName(user: PickerUser): string | null {
  if (user.name) return user.name;
  return user.username ? `@${user.username}` : null;
}

export function getPickerUserHandle(user: PickerUser): string | null {
  return user.name && user.username ? `@${user.username}` : null;
}

export function toPickerAvatarUser(user: PickerUser): { name: string; image: string | null } {
  return { name: resolveDisplayName(user), image: user.image };
}

export function indexPickerUsers(users: readonly PickerUser[]): Map<string, PickerUser> {
  const usersById = new Map<string, PickerUser>();
  for (const user of users) usersById.set(user.id, user);
  return usersById;
}
