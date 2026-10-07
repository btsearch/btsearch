import { type QueryClient, queryOptions } from "@tanstack/react-query";
import i18next from "i18next";
import { toast } from "sonner";

import { USER_DETAIL_PRELOAD_STALE_TIME } from "../constants";
import type { AdminSession, AdminUser, SessionDevice, UserRole } from "../types";
import { isBanInForce } from "../utils/ban";
import { resolveDisplayName } from "../utils/identity";
import { toUserRole } from "../utils/roles";
import { deleteAvatarFile } from "./account";
import { invalidateUserAdminQueries, userAdminKeys } from "./queryKeys";
import { readAuthError } from "@/features/settings/authErrors";
import { BackendUnavailableError, showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";

type AuthResult<T> = { data: T | null; error: unknown };
type RoleKnownToAuthClient = "user" | "admin";
type DeviceReader = (userAgent: string | null) => SessionDevice;
type BanBody = { userId: string; banReason?: string; banExpiresIn?: number };

export type AdminUserChanges = {
  name?: string;
  username?: string;
  bio?: string | null;
  email?: string;
  isEmailVerified?: boolean;
  isTwoFactorRequired?: boolean;
  image?: null;
};

export type BanRequest = { reason: string; expiresInSeconds: number | null };

export const AUTH_ERROR_CODES = {
  cannotBanYourself: "YOU_CANNOT_BAN_YOURSELF",
  cannotRemoveYourself: "YOU_CANNOT_REMOVE_YOURSELF",
  usernameTaken: "USERNAME_IS_ALREADY_TAKEN",
  emailInUse: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  invalidEmail: "INVALID_EMAIL",
  passwordTooShort: "PASSWORD_TOO_SHORT",
  passwordTooLong: "PASSWORD_TOO_LONG",
  userNotFound: "USER_NOT_FOUND",
} as const;

const AUTH_ERROR_TEXT_KEYS: ReadonlyMap<string, string> = new Map<string, string>([
  [AUTH_ERROR_CODES.cannotBanYourself, "admin:users.shared.errors.cannotBanYourself"],
  [AUTH_ERROR_CODES.cannotRemoveYourself, "admin:users.shared.errors.cannotRemoveYourself"],
  [AUTH_ERROR_CODES.usernameTaken, "settings:account.username.taken"],
  [AUTH_ERROR_CODES.emailInUse, "admin:users.shared.errors.emailInUse"],
  [AUTH_ERROR_CODES.invalidEmail, "admin:users.shared.errors.invalidEmail"],
  [AUTH_ERROR_CODES.passwordTooShort, "common:password.tooShort"],
  [AUTH_ERROR_CODES.passwordTooLong, "admin:users.shared.errors.passwordTooLong"],
  [AUTH_ERROR_CODES.userNotFound, "common:error.userNotFoundDescription"],
]);

const GATEWAY_FAILURE_STATUSES = new Set([502, 503, 504]);
const MAX_QUERY_RETRIES = 2;
const UNEXPECTED_RESPONSE_MESSAGE = "The auth response has an unexpected shape";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStatus(failure: unknown): number | undefined {
  return isRecord(failure) && typeof failure.status === "number" ? failure.status : undefined;
}

function readText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readInstant(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

class AuthAdminError extends Error {
  code: string | undefined;
  status: number | undefined;

  constructor(failure: unknown) {
    super(readAuthError(failure).message ?? "");
    this.code = readAuthError(failure).code;
    this.status = readStatus(failure);
  }
}

export function hasAuthErrorCode(error: unknown, code: string): boolean {
  return error instanceof AuthAdminError && error.code === code;
}

async function unwrapAuthResult<T>(request: Promise<AuthResult<T>>): Promise<T> {
  let result: AuthResult<T>;
  try {
    result = await request;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new BackendUnavailableError(0);
  }

  if (result.error !== null && result.error !== undefined) {
    const status = readStatus(result.error);
    if (status !== undefined && GATEWAY_FAILURE_STATUSES.has(status)) throw new BackendUnavailableError(status);
    throw new AuthAdminError(result.error);
  }
  if (result.data === null) throw new Error(UNEXPECTED_RESPONSE_MESSAGE);
  return result.data;
}

export function showUserAdminError(error: unknown): void {
  if (!(error instanceof AuthAdminError)) {
    showApiError(error);
    return;
  }

  const textKey = error.code === undefined ? undefined : AUTH_ERROR_TEXT_KEYS.get(error.code);
  const description = textKey === undefined ? error.message || i18next.t("common:error.tryLater") : i18next.t(textKey);
  toast.error(i18next.t("common:error.actionFailed"), { description });
}

function toAdminUser(payload: unknown): AdminUser {
  if (!isRecord(payload)) throw new Error(UNEXPECTED_RESPONSE_MESSAGE);

  const id = readText(payload.id);
  const createdAt = readInstant(payload.createdAt);
  if (id === null || createdAt === null) throw new Error(UNEXPECTED_RESPONSE_MESSAGE);

  const username = readText(payload.username);
  const banExpiresAt = readInstant(payload.banExpires);
  return {
    id,
    username,
    name: resolveDisplayName({ name: readText(payload.name), username }),
    image: readText(payload.image),
    email: readText(payload.email) ?? "",
    isEmailVerified: payload.emailVerified === true,
    role: toUserRole(payload.role),
    isBanned: isBanInForce(payload.banned === true, banExpiresAt, new Date()),
    banReason: readText(payload.banReason),
    banExpiresAt,
    isTwoFactorEnabled: payload.twoFactorEnabled === true,
    isTwoFactorRequired: payload.forceTotp === true,
    locale: readText(payload.locale),
    bio: readText(payload.bio),
    createdAt,
    updatedAt: readInstant(payload.updatedAt) ?? createdAt,
  };
}

function readUserEnvelope(payload: unknown): AdminUser {
  return toAdminUser(isRecord(payload) ? payload.user : null);
}

function readSessionPayloads(payload: unknown): unknown[] {
  return isRecord(payload) && Array.isArray(payload.sessions) ? payload.sessions : [];
}

function toAdminSession(payload: unknown, userId: string, readDevice: DeviceReader): AdminSession | null {
  if (!isRecord(payload)) return null;

  const id = readText(payload.id);
  const token = readText(payload.token);
  const createdAt = readInstant(payload.createdAt);
  const expiresAt = readInstant(payload.expiresAt);
  if (id === null || token === null || createdAt === null || expiresAt === null) return null;

  const userAgent = readText(payload.userAgent);
  return {
    id,
    token,
    userId: readText(payload.userId) ?? userId,
    createdAt,
    updatedAt: readInstant(payload.updatedAt) ?? createdAt,
    expiresAt,
    ipAddress: readText(payload.ipAddress),
    userAgent,
    impersonatedBy: readText(payload.impersonatedBy),
    device: readDevice(userAgent),
  };
}

function compareNewestFirst(left: AdminSession, right: AdminSession): number {
  if (left.createdAt === right.createdAt) return 0;
  return left.createdAt < right.createdAt ? 1 : -1;
}

function toAuthUserData(changes: AdminUserChanges): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (changes.name !== undefined) data.name = changes.name;
  if (changes.username !== undefined) data.username = changes.username;
  if (changes.bio !== undefined) data.bio = changes.bio;
  if (changes.email !== undefined) data.email = changes.email;
  if (changes.isEmailVerified !== undefined) data.emailVerified = changes.isEmailVerified;
  if (changes.isTwoFactorRequired !== undefined) data.forceTotp = changes.isTwoFactorRequired;
  if (changes.image !== undefined) data.image = changes.image;
  return data;
}

function shouldRetryAuthQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof AuthAdminError) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

async function fetchAdminUser(userId: string): Promise<AdminUser | null> {
  try {
    return toAdminUser(await unwrapAuthResult(authClient.admin.getUser({ query: { id: userId } })));
  } catch (error) {
    if (hasAuthErrorCode(error, AUTH_ERROR_CODES.userNotFound)) return null;
    throw error;
  }
}

async function fetchUserSessions(userId: string): Promise<AdminSession[]> {
  const [payload, { default: Bowser }] = await Promise.all([unwrapAuthResult(authClient.admin.listUserSessions({ userId })), import("bowser")]);

  function readDevice(userAgent: string | null): SessionDevice {
    const { browser, os, platform } = Bowser.parse(userAgent ?? "");
    return { browser: browser.name, os: os.name, mobile: platform.type === "mobile" || platform.type === "tablet" };
  }

  const sessions: AdminSession[] = [];
  for (const sessionPayload of readSessionPayloads(payload)) {
    const session = toAdminSession(sessionPayload, userId, readDevice);
    if (session !== null) sessions.push(session);
  }
  return sessions.sort(compareNewestFirst);
}

export async function setUserRole(userId: string, role: UserRole): Promise<AdminUser> {
  return readUserEnvelope(await unwrapAuthResult(authClient.admin.setRole({ userId, role: role as RoleKnownToAuthClient })));
}

export async function banUser(userId: string, ban: BanRequest): Promise<AdminUser> {
  const body: BanBody = { userId };
  const reason = ban.reason.trim();
  if (reason !== "") body.banReason = reason;
  if (ban.expiresInSeconds !== null) body.banExpiresIn = ban.expiresInSeconds;
  return readUserEnvelope(await unwrapAuthResult(authClient.admin.banUser(body)));
}

export async function unbanUser(userId: string): Promise<AdminUser> {
  return readUserEnvelope(await unwrapAuthResult(authClient.admin.unbanUser({ userId })));
}

export async function updateUserFields(userId: string, changes: AdminUserChanges): Promise<AdminUser> {
  return toAdminUser(await unwrapAuthResult(authClient.admin.updateUser({ userId, data: toAuthUserData(changes) })));
}

export async function changeUserEmail(userId: string, email: string): Promise<AdminUser> {
  return updateUserFields(userId, { email: email.trim(), isEmailVerified: false });
}

export async function removeUserAvatar(userId: string): Promise<AdminUser> {
  await deleteAvatarFile(userId);
  return updateUserFields(userId, { image: null });
}

export async function setUserPassword(userId: string, newPassword: string): Promise<void> {
  await unwrapAuthResult(authClient.admin.setUserPassword({ userId, newPassword }));
}

export async function removeUser(userId: string): Promise<void> {
  await unwrapAuthResult(authClient.admin.removeUser({ userId }));
}

export async function revokeUserSession(sessionToken: string): Promise<void> {
  await unwrapAuthResult(authClient.admin.revokeUserSession({ sessionToken }));
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await unwrapAuthResult(authClient.admin.revokeUserSessions({ userId }));
}

export function adminUserQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userAdminKeys.account(userId),
    queryFn: () => fetchAdminUser(userId),
    retry: shouldRetryAuthQuery,
    staleTime: 0,
  });
}

export function storeUpdatedAccount(queryClient: QueryClient, updatedUser: AdminUser): void {
  queryClient.setQueryData(adminUserQueryOptions(updatedUser.id).queryKey, updatedUser);
  void invalidateUserAdminQueries(queryClient, updatedUser.id);
}

export function userSessionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: userAdminKeys.sessions(userId),
    queryFn: () => fetchUserSessions(userId),
    retry: shouldRetryAuthQuery,
    staleTime: USER_DETAIL_PRELOAD_STALE_TIME,
  });
}
