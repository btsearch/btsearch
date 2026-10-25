import type { GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware, getAuthoritativeSessionFromCtx, getSessionFromCtx } from "better-auth/api";
import { createHash } from "node:crypto";

import { API_KEYS_LIMIT, API_KEY_COOLDOWN_KEY_PREFIX, API_KEY_COOLDOWN_SECONDS } from "../../constants.js";
import { db } from "../../database/psql.js";
import { redis } from "../../database/redis.js";
import { auditEndpointEvent, rememberEndpointSnapshot } from "../../features/audit/auth/endpoints.js";
import {
  ADMINISTERED_USER_PATHS,
  SELF_DELETE_PATH,
  auditUserAdministration,
  rememberAdministeredUser,
  rememberDeletingUser,
} from "../../features/audit/auth/userAdministration.js";
import { generateFingerprintFromWebRequest } from "../../utils/fingerprint.js";
import { logger } from "../../utils/logger.js";
import { isAppClient, isAppOnlyScope } from "./appClient.js";
import { APP_ONLY_SCOPES } from "./scopes.js";

type HookCtx = GenericEndpointContext;

const MAX_ACCOUNTS_PER_FINGERPRINT = 3;
const ACCOUNT_LIMIT_WINDOW = 30 * 24 * 3600;
const ACCOUNT_LIMIT_CODE = "ACCOUNT_LIMIT_REACHED";
const VERIFICATION_RESEND_PATH = "/send-verification-email";
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 12 * 60 * 60;
const EMAIL_SIGN_UP_PATH = "/sign-up/email";
const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
const SOCIAL_CALLBACK_PATH = "/callback/:id";
const ADMIN_PATH_PREFIX = "/admin/";
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APP_ONLY_SCOPE_DESCRIPTION = `${APP_ONLY_SCOPES.join(", ")} is reserved for the BTSearch app`;

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

async function handleApiKeyUpdate(ctx: HookCtx) {
  if (ctx.body?.metadata !== undefined) throw new APIError("BAD_REQUEST", { message: "Metadata is not allowed when updating API keys" });
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
  const request = (ctx.method === "POST" && isAppRequest ? ctx.body : ctx.query) as { scope?: unknown; client_id?: unknown } | undefined;
  const scope = typeof request?.scope === "string" ? request.scope.trim() : "";
  if (scope === "") throw new APIError("BAD_REQUEST", { error: "invalid_scope", error_description: "scope is required" });

  const isAppClientRequest = typeof request?.client_id === "string" && isAppClient(request.client_id);
  if (!isAppClientRequest && scope.split(" ").some(isAppOnlyScope)) {
    throw new APIError("BAD_REQUEST", { error: "invalid_scope", error_description: APP_ONLY_SCOPE_DESCRIPTION });
  }
}

async function handleOAuthConsentUpdate(ctx: HookCtx) {
  const scopes = (ctx.body as { update?: { scopes?: unknown } } | undefined)?.update?.scopes;
  if (Array.isArray(scopes) && scopes.some((scope) => typeof scope === "string" && isAppOnlyScope(scope))) {
    throw new APIError("BAD_REQUEST", { error: "invalid_request", error_description: APP_ONLY_SCOPE_DESCRIPTION });
  }
}

function bodyUserId(ctx: HookCtx): string | null {
  const userId: unknown = ctx.body?.userId;
  return typeof userId === "string" && CANONICAL_UUID_PATTERN.test(userId) ? userId : null;
}

function assertCanonicalUserId(ctx: HookCtx): void {
  if (!ctx.path.startsWith(ADMIN_PATH_PREFIX) || ctx.body?.userId === undefined) return;
  if (bodyUserId(ctx) === null) throw new APIError("BAD_REQUEST", { message: "Invalid user id" });
}

async function rememberTargetUser(ctx: HookCtx): Promise<void> {
  const userId = bodyUserId(ctx);
  if (userId === null) throw new APIError("BAD_REQUEST", { message: "Invalid user id" });

  await rememberAdministeredUser(ctx, userId);
}

const beforeHandlers: { path: string; handler: (ctx: HookCtx) => Promise<unknown> }[] = [
  { path: EMAIL_SIGN_UP_PATH, handler: handleSignUp },
  { path: VERIFICATION_RESEND_PATH, handler: handleVerificationResend },
  { path: "/api-key/create", handler: handleApiKeyCreate },
  { path: "/api-key/update", handler: handleApiKeyUpdate },
  { path: "/oauth2/create-client", handler: handleOAuthClientWrite },
  { path: "/oauth2/update-client", handler: handleOAuthClientWrite },
  { path: "/oauth2/authorize", handler: handleOAuthAuthorize },
  { path: "/oauth2/update-consent", handler: handleOAuthConsentUpdate },
  ...ADMINISTERED_USER_PATHS.map((path) => ({ path, handler: rememberTargetUser })),
  { path: SELF_DELETE_PATH, handler: rememberDeletingUser },
];

export const beforeAuthHook = createAuthMiddleware(async (ctx) => {
  assertCanonicalUserId(ctx as HookCtx);
  await beforeHandlers.find(({ path }) => ctx.path.startsWith(path))?.handler(ctx as HookCtx);
  await rememberEndpointSnapshot(ctx as HookCtx);
});

export const afterAuthHook = createAuthMiddleware(async (ctx) => {
  await auditUserAdministration(ctx as HookCtx, ctx.context.returned);
  await auditEndpointEvent(ctx as HookCtx, ctx.context.returned);

  if (ctx.path === "/passkey/verify-authentication") {
    const returned = ctx.context.returned as { session?: { userId?: string } } | undefined;
    const userId = returned?.session?.userId;
    if (userId) await redis.setEx(passkeyVerifiedKey(userId), PASSKEY_VERIFIED_TTL, "1");
  }

  if (ctx.path === "/api-key/create") await settleApiKeyCooldown(ctx, ctx.context.returned);
});
