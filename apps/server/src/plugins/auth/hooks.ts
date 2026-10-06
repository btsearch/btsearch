import { roleGrants, users } from "@openbts/drizzle";
import type { AuditOperationKind } from "@openbts/shared/audit";
import type { GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, getSessionFromCtx } from "better-auth/api";
import { eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { API_KEYS_LIMIT, API_KEY_COOLDOWN_KEY_PREFIX, API_KEY_COOLDOWN_SECONDS } from "../../constants.js";
import { db } from "../../database/psql.js";
import { redis } from "../../database/redis.js";
import { syncGrantsWithRole } from "../../features/access/roleGrants.js";
import { type AuditContext, type AuditEntryInput, runAuditedOperation, systemAuditContext } from "../../features/audit/index.js";
import { generateFingerprintFromWebRequest } from "../../utils/fingerprint.js";
import { logger } from "../../utils/logger.js";

type HookCtx = GenericEndpointContext;
type UserSnapshot = {
  id: string;
  username: string | null;
  email: string;
  role: string;
  banned: boolean;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  grantIds: string[];
};
type AuditedUserField = (typeof AUDITED_USER_FIELDS)[number];
type UserChange = { kind: AuditOperationKind; entry: AuditEntryInput };
type UserRemover = "self" | "impersonator" | "admin";
type PendingUserAudit = { before: UserSnapshot; impersonatedBy: string | null };

const MAX_ACCOUNTS_PER_FINGERPRINT = 3;
const ACCOUNT_LIMIT_WINDOW = 30 * 24 * 3600;
const ACCOUNT_LIMIT_CODE = "ACCOUNT_LIMIT_REACHED";
const VERIFICATION_RESEND_PATH = "/send-verification-email";
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 12 * 60 * 60;
const EMAIL_SIGN_UP_PATH = "/sign-up/email";
const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
const SOCIAL_CALLBACK_PATH = "/callback/:id";
const ADMIN_PATH_PREFIX = "/admin/";
const SET_ROLE_PATH = "/admin/set-role";
const UPDATE_USER_PATH = "/admin/update-user";
const SET_PASSWORD_PATH = "/admin/set-user-password";
const CREATE_USER_PATH = "/admin/create-user";
const REMOVE_USER_PATH = "/admin/remove-user";
const SELF_DELETE_PATH = "/delete-user";
const BAN_FIELDS = ["banned", "banReason", "banExpires"] as const;
const AUDITED_USER_FIELDS = ["role", "email", ...BAN_FIELDS] as const;
const AUDITED_FIELDS_BY_PATH: Record<string, readonly AuditedUserField[]> = {
  [SET_ROLE_PATH]: ["role"],
  [UPDATE_USER_PATH]: AUDITED_USER_FIELDS,
  "/admin/ban-user": BAN_FIELDS,
  "/admin/unban-user": BAN_FIELDS,
};
const REMOVAL_METADATA = { self: { self: true }, impersonator: { impersonated: true }, admin: null } as const;
const DEFAULT_ROLE = "user";
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_IP_LENGTH = 60;

const pendingUserAudits = new WeakMap<object, PendingUserAudit>();
const pendingBanLifts = new WeakSet<object>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function verificationResendKey(email: string): string {
  const recipientHash = createHash("sha256").update(normalizeEmail(email)).digest("hex");
  return `auth:verification-resend:${recipientHash}`;
}

function isVerificationResendRequest(request: Request | undefined): request is Request {
  return request !== undefined && new URL(request.url).pathname.endsWith(VERIFICATION_RESEND_PATH);
}

export async function releaseVerificationResendCooldown(email: string, request: Request | undefined): Promise<void> {
  if (!isVerificationResendRequest(request)) return;

  try {
    await redis.del(verificationResendKey(email));
  } catch (error) {
    logger.error("auth.verificationResend.release", { error });
  }
}

function getRegistrationKey(ctx: HookCtx): string | null {
  if (!ctx.request) return null;
  const fp = generateFingerprintFromWebRequest(ctx.request as Request);
  if (fp) return `reg:count:fp:${fp}`;
  const forwarded = (ctx.request as Request).headers.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0]?.trim() : null) ?? (ctx.request as Request).headers.get("x-real-ip");
  return ip ? `reg:count:ip:${ip}` : null;
}

async function checkAccountLimit(key: string): Promise<void> {
  const count = Number.parseInt((await redis.get(key)) ?? "0");
  if (count >= MAX_ACCOUNTS_PER_FINGERPRINT) {
    throw new APIError("TOO_MANY_REQUESTS", { code: ACCOUNT_LIMIT_CODE, message: "Account creation limit reached for this network" });
  }
}

async function incrementAccountCount(key: string): Promise<void> {
  const ttl = await redis.ttl(key);
  await redis.incr(key);
  if (ttl <= 0) await redis.expire(key, ACCOUNT_LIMIT_WINDOW);
}

export const PASSKEY_VERIFIED_TTL = 5 * 60; // 5 minutes
export const passkeyVerifiedKey = (userId: string) => `passkey-verified:${userId}`;

const API_KEY_CREATE_LOCK_SECONDS = 60;
const API_KEY_CREATE_PENDING = "pending";

const apiKeyCooldownKey = (userId: string) => `${API_KEY_COOLDOWN_KEY_PREFIX}${userId}`;

async function handleApiKeyCreate(ctx: HookCtx) {
  const session = await getAuthoritativeSessionFromCtx(ctx);
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Unauthorized access to this endpoint" });

  const prefix = ctx.body?.prefix;
  if (typeof prefix === "string" && prefix.startsWith("pk_"))
    throw new APIError("BAD_REQUEST", { message: "Publishable API keys can no longer be created" });
  if (ctx.body?.metadata) throw new APIError("BAD_REQUEST", { message: "Metadata is not allowed when creating API keys" });
  if (session.user.role === "admin") return;

  const keys = await db.query.apikeys.findMany({
    where: { referenceId: session.user.id },
  });
  const secretKeyCount = keys.filter((key) => !key.start?.startsWith("pk_")).length;

  if (secretKeyCount >= API_KEYS_LIMIT) {
    throw new APIError("FORBIDDEN", {
      message: "You have reached the maximum number of API keys. Please delete an existing key before creating a new one",
    });
  }

  const cooldownKey = apiKeyCooldownKey(session.user.id);
  const locked = await redis.set(cooldownKey, API_KEY_CREATE_PENDING, {
    expiration: { type: "EX", value: API_KEY_CREATE_LOCK_SECONDS },
    condition: "NX",
  });
  if (locked) return;

  if ((await redis.get(cooldownKey)) === API_KEY_CREATE_PENDING) throw new APIError("CONFLICT", { message: "An API key is already being created" });

  const daysLeft = Math.max(1, Math.ceil((await redis.ttl(cooldownKey)) / 86400));
  throw new APIError("TOO_MANY_REQUESTS", {
    message: `You can only create one API key every 7 days. Try again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
  });
}

async function settleApiKeyCooldown(ctx: HookCtx, returned: unknown) {
  const session = await getSessionFromCtx(ctx);
  if (!session || session.user.role === "admin") return;

  const cooldownKey = apiKeyCooldownKey(session.user.id);
  if (returned instanceof Error) await redis.del(cooldownKey);
  else await redis.setEx(cooldownKey, API_KEY_COOLDOWN_SECONDS, "1");
}

async function handleSignUp(ctx: HookCtx) {
  const usernameValue = ctx.body?.username as string | undefined;
  if (!usernameValue || usernameValue.trim().length === 0) throw new APIError("BAD_REQUEST", { message: "Username is required" });

  const key = getRegistrationKey(ctx);
  if (key) await checkAccountLimit(key);
}

function isSocialCallback(ctx: HookCtx): boolean {
  const providerId: unknown = ctx.params?.id;
  return ctx.path === SOCIAL_CALLBACK_PATH && typeof providerId === "string" && Object.hasOwn(ctx.context.options.socialProviders ?? {}, providerId);
}

function isSocialSignIn(ctx: HookCtx): boolean {
  return ctx.path === SOCIAL_SIGN_IN_PATH || isSocialCallback(ctx);
}

function isSignUp(ctx: HookCtx): boolean {
  return ctx.path === EMAIL_SIGN_UP_PATH || isSocialSignIn(ctx);
}

export async function assertSocialSignUpWithinLimit(ctx: HookCtx | null): Promise<void> {
  if (!ctx || !isSocialSignIn(ctx)) return;

  const key = getRegistrationKey(ctx);
  if (key) await checkAccountLimit(key);
}

export async function countSignUp(ctx: HookCtx | null): Promise<void> {
  if (!ctx || !isSignUp(ctx)) return;

  const key = getRegistrationKey(ctx);
  if (key === null) return;

  try {
    await incrementAccountCount(key);
  } catch (error) {
    logger.error("auth.signUp.count", { error });
  }
}

async function handleVerificationResend(ctx: HookCtx) {
  if (!ctx.request) return;

  const email = ctx.body?.email;
  if (typeof email !== "string") return;

  const normalizedEmail = normalizeEmail(email);
  const session = await getSessionFromCtx(ctx);
  if (session && (normalizeEmail(session.user.email) !== normalizedEmail || session.user.emailVerified)) return;

  const key = verificationResendKey(normalizedEmail);
  const reserved = await redis.set(key, "1", {
    expiration: { type: "EX", value: VERIFICATION_RESEND_COOLDOWN_SECONDS },
    condition: "NX",
  });
  if (reserved) return;

  const ttl = await redis.ttl(key);
  const retryAfter = ttl > 0 ? ttl : VERIFICATION_RESEND_COOLDOWN_SECONDS;
  throw new APIError(
    "TOO_MANY_REQUESTS",
    {
      code: "VERIFICATION_EMAIL_RATE_LIMITED",
      message: "A verification email can only be requested once every 12 hours.",
    },
    { "Retry-After": String(retryAfter), "X-Retry-After": String(retryAfter) },
  );
}

async function handleOAuthClientWrite(ctx: HookCtx) {
  const body = ctx.body as { logo_uri?: unknown; update?: { logo_uri?: unknown } } | undefined;
  if (body?.logo_uri !== undefined || body?.update?.logo_uri !== undefined)
    throw new APIError("BAD_REQUEST", { message: "Custom application logos are not supported" });
}

async function handleOAuthAuthorize(ctx: HookCtx) {
  const { authorizeSettings } = ctx as HookCtx & { authorizeSettings?: { isAuthorize?: boolean } | null };
  const isAppRequest = !authorizeSettings || authorizeSettings.isAuthorize === true;
  const request = (ctx.method === "POST" && isAppRequest ? ctx.body : ctx.query) as { scope?: unknown } | undefined;
  const hasScope = typeof request?.scope === "string" && request.scope.trim() !== "";
  if (!hasScope) throw new APIError("BAD_REQUEST", { error: "invalid_scope", error_description: "scope is required" });
}

function hookAuditContext(ctx: HookCtx, actorId: string | null, isAnonymous = false): AuditContext {
  const headers = isAnonymous ? undefined : (ctx.request as Request | undefined)?.headers;
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipAddress = forwarded || headers?.get("x-real-ip") || null;

  return {
    actorId,
    performedBy: actorId,
    source: "api",
    ipAddress: ipAddress?.slice(0, MAX_IP_LENGTH) ?? null,
    userAgent: headers?.get("user-agent") ?? null,
    clientKey: null,
    clientKind: null,
  };
}

async function loadUserSnapshot(userId: string): Promise<UserSnapshot | undefined> {
  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpires: users.banExpires,
      createdAt: users.createdAt,
      grantIds: sql<string[]>`ARRAY(SELECT ${roleGrants.id} FROM ${roleGrants} WHERE ${roleGrants.userId} = ${userId})`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ? { ...user, banned: user.banned === true } : undefined;
}

function bodyUserId(ctx: HookCtx): string | null {
  const userId: unknown = ctx.body?.userId;
  return typeof userId === "string" && CANONICAL_UUID_PATTERN.test(userId) ? userId : null;
}

function assertCanonicalUserId(ctx: HookCtx): void {
  if (!ctx.path.startsWith(ADMIN_PATH_PREFIX) || ctx.body?.userId === undefined) return;
  if (bodyUserId(ctx) === null) throw new APIError("BAD_REQUEST", { message: "Invalid user id" });
}

function createdUserId(returned: unknown): string | null {
  if (typeof returned !== "object" || returned === null || !("user" in returned)) return null;

  const { user } = returned;
  if (typeof user !== "object" || user === null || !("id" in user)) return null;
  return typeof user.id === "string" ? user.id : null;
}

function auditedFields(ctx: HookCtx): readonly AuditedUserField[] {
  const fields = AUDITED_FIELDS_BY_PATH[ctx.path] ?? [];
  if (ctx.path !== UPDATE_USER_PATH) return fields;

  const data: unknown = ctx.body?.data;
  return typeof data === "object" && data !== null ? fields.filter((field) => field in data) : [];
}

async function rememberTargetUser(ctx: HookCtx): Promise<void> {
  const userId = bodyUserId(ctx);
  if (userId === null) throw new APIError("BAD_REQUEST", { message: "Invalid user id" });
  if (!ctx.request) return;

  const before = await loadUserSnapshot(userId);
  if (before) pendingUserAudits.set(ctx.request, { before, impersonatedBy: null });
}

async function rememberDeletingUser(ctx: HookCtx): Promise<void> {
  try {
    if (!ctx.request) return;

    const session = await getAuthoritativeSessionFromCtx(ctx);
    if (!session) return;

    const impersonatedBy: unknown = session.session.impersonatedBy;
    const before = await loadUserSnapshot(session.user.id);
    if (before) pendingUserAudits.set(ctx.request, { before, impersonatedBy: typeof impersonatedBy === "string" ? impersonatedBy : null });
  } catch (error) {
    logger.error("auth.userAudit.snapshot", { error });
  }
}

function isSameValue(left: unknown, right: unknown): boolean {
  return left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
}

function userChangeKind(fields: readonly AuditedUserField[], after: UserSnapshot): AuditOperationKind | null {
  if (fields.includes("role")) return "user.role";
  if (fields.includes("banned")) return after.banned ? "user.ban" : "user.unban";
  if (fields.includes("email")) return "user.email";
  return fields.length > 0 && after.banned ? "user.ban" : null;
}

function describeUserUpdate(before: UserSnapshot, after: UserSnapshot, audited: readonly AuditedUserField[]): UserChange | null {
  const fields = audited.filter((field) => !isSameValue(before[field], after[field]));
  const kind = userChangeKind(fields, after);
  if (kind === null) return null;

  const pick = (user: UserSnapshot) => Object.fromEntries(fields.map((field) => [field, user[field]]));
  return {
    kind,
    entry: { entity: "users", op: "update", recordId: before.id, old: pick(before), new: pick(after), metadata: { username: after.username } },
  };
}

function describeUserRemoval({ id, username, role, banned, createdAt }: UserSnapshot, removedBy: UserRemover): UserChange {
  const old = removedBy === "self" ? { id, role, createdAt } : { id, username, role, banned, createdAt };
  return { kind: "user.delete", entry: { entity: "users", op: "delete", recordId: id, old, metadata: REMOVAL_METADATA[removedBy] } };
}

function describePasswordChange({ id, username }: UserSnapshot): UserChange {
  return { kind: "user.password", entry: { entity: "users", op: "update", recordId: id, metadata: { username } } };
}

function describeUserChange(ctx: HookCtx, { before, impersonatedBy }: PendingUserAudit, after: UserSnapshot | undefined): UserChange | null {
  if (ctx.path.startsWith(SELF_DELETE_PATH)) {
    if (after) return null;
    return describeUserRemoval(before, impersonatedBy === null ? "self" : "impersonator");
  }
  if (ctx.path === REMOVE_USER_PATH) return after ? null : describeUserRemoval(before, "admin");
  if (ctx.path === SET_PASSWORD_PATH) return after ? describePasswordChange(after) : null;
  return after ? describeUserUpdate(before, after, auditedFields(ctx)) : null;
}

function takePendingUserAudit(ctx: HookCtx): PendingUserAudit | undefined {
  if (!ctx.request) return undefined;

  const pending = pendingUserAudits.get(ctx.request);
  pendingUserAudits.delete(ctx.request);
  return pending;
}

async function auditUserChange(ctx: HookCtx, pending: PendingUserAudit, returned: unknown): Promise<void> {
  const isSelfDelete = ctx.path.startsWith(SELF_DELETE_PATH);
  if (returned instanceof Error) {
    const isRedirect = "status" in returned && returned.status === "FOUND";
    if (!(isSelfDelete && isRedirect)) return;
  }

  try {
    const change = describeUserChange(ctx, pending, await loadUserSnapshot(pending.before.id));
    if (!change) return;

    const isOwnDeletion = isSelfDelete && pending.impersonatedBy === null;
    const actorId = isSelfDelete ? pending.impersonatedBy : ((await getSessionFromCtx(ctx))?.user.id ?? null);
    const spec = { kind: change.kind, metadata: change.entry.metadata };
    await runAuditedOperation(hookAuditContext(ctx, actorId, isOwnDeletion), spec, (_tx, audit) => audit.log(change.entry));
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

async function auditCreatedUser(ctx: HookCtx, userId: string): Promise<void> {
  try {
    const [user, session] = await Promise.all([loadUserSnapshot(userId), getSessionFromCtx(ctx)]);
    if (!user || (user.role === DEFAULT_ROLE && !user.banned)) return;

    const { id, username, role, banned, banReason, banExpires } = user;
    const kind: AuditOperationKind = role === DEFAULT_ROLE ? "user.ban" : "user.role";
    await runAuditedOperation(hookAuditContext(ctx, session?.user.id ?? null), { kind, metadata: { username } }, (_tx, audit) =>
      audit.log({ entity: "users", op: "create", recordId: id, new: { role, banned, banReason, banExpires }, metadata: { username } }),
    );
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

export function rememberLiftedBan(data: Record<string, unknown>, ctx: HookCtx | null): void {
  if (ctx && data.banned === false && !Object.hasOwn(AUDITED_FIELDS_BY_PATH, ctx.path)) pendingBanLifts.add(ctx);
}

export async function auditLiftedBan(updated: { id: string }, ctx: HookCtx | null): Promise<void> {
  if (!ctx || !pendingBanLifts.delete(ctx)) return;

  try {
    const user = await loadUserSnapshot(updated.id);
    if (!user || user.banned) return;

    const metadata = { username: user.username };
    await runAuditedOperation(systemAuditContext(), { kind: "user.unban", metadata }, (_tx, audit) =>
      audit.log({ entity: "users", op: "update", recordId: user.id, old: { banned: true }, new: { banned: false }, metadata }),
    );
  } catch (error) {
    logger.error("auth.userAudit.record", { error });
  }
}

const beforeHandlers: { path: string; handler: (ctx: HookCtx) => Promise<unknown> }[] = [
  { path: EMAIL_SIGN_UP_PATH, handler: handleSignUp },
  { path: VERIFICATION_RESEND_PATH, handler: handleVerificationResend },
  { path: "/api-key/create", handler: handleApiKeyCreate },
  { path: "/oauth2/create-client", handler: handleOAuthClientWrite },
  { path: "/oauth2/update-client", handler: handleOAuthClientWrite },
  { path: "/oauth2/authorize", handler: handleOAuthAuthorize },
  ...Object.keys(AUDITED_FIELDS_BY_PATH).map((path) => ({ path, handler: rememberTargetUser })),
  { path: SET_PASSWORD_PATH, handler: rememberTargetUser },
  { path: REMOVE_USER_PATH, handler: rememberTargetUser },
  { path: SELF_DELETE_PATH, handler: rememberDeletingUser },
];

export const beforeAuthHook = createAuthMiddleware(async (ctx) => {
  assertCanonicalUserId(ctx as HookCtx);

  for (const { path, handler } of beforeHandlers) {
    if (ctx.path.startsWith(path)) {
      return handler(ctx as HookCtx);
    }
  }
});

async function syncRoleGrants(ctx: HookCtx, userId: string, before?: UserSnapshot): Promise<void> {
  try {
    const [user, session] = await Promise.all([loadUserSnapshot(userId), getSessionFromCtx(ctx)]);
    if (!user) return;

    const actorId = session?.user.id ?? null;
    const kind = user.role === "editor" ? "grant.create" : "grant.delete";
    const sync = { userId: user.id, previousRole: before?.role, earlierGrantIds: before?.grantIds ?? [], grantedById: actorId };
    await runAuditedOperation(hookAuditContext(ctx, actorId), { kind }, (tx, audit) => syncGrantsWithRole(tx, audit, sync));
  } catch (error) {
    logger.error("auth.setRole.syncGrants", { error });
  }
}

async function auditUserAdministration(ctx: HookCtx, returned: unknown): Promise<void> {
  const pending = takePendingUserAudit(ctx);
  if (pending) await auditUserChange(ctx, pending, returned);
  if (returned instanceof Error) return;

  const isCreate = ctx.path === CREATE_USER_PATH;
  const isRoleWrite = ctx.path === SET_ROLE_PATH || (ctx.path === UPDATE_USER_PATH && ctx.body?.data?.role !== undefined);
  if (!isCreate && !isRoleWrite) return;

  const userId = isCreate ? createdUserId(returned) : bodyUserId(ctx);
  if (userId === null) return;

  if (isCreate) await auditCreatedUser(ctx, userId);
  await syncRoleGrants(ctx, userId, pending?.before);
}

export const afterAuthHook = createAuthMiddleware(async (ctx) => {
  await auditUserAdministration(ctx as HookCtx, ctx.context.returned);

  if (ctx.path === "/passkey/verify-authentication") {
    const returned = ctx.context.returned as { session?: { userId?: string } } | undefined;
    const userId = returned?.session?.userId;
    if (userId) await redis.setEx(passkeyVerifiedKey(userId), PASSKEY_VERIFIED_TTL, "1");
  }

  if (ctx.path === "/api-key/create") await settleApiKeyCooldown(ctx, ctx.context.returned);
});
