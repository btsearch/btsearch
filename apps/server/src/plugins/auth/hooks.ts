import { createLocalAccountIssuer } from "@better-auth/core/db";
import { hash } from "@node-rs/argon2";
import * as schema from "@openbts/drizzle";
import type { GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { createHash } from "node:crypto";

import { API_KEYS_LIMIT, API_KEY_COOLDOWN_SECONDS, ARGON2_OPTIONS } from "../../constants.js";
import { db } from "../../database/psql.js";
import { redis } from "../../database/redis.js";
import { generateFingerprintFromWebRequest } from "../../utils/fingerprint.js";
import { logger } from "../../utils/logger.js";

type HookCtx = GenericEndpointContext;

const MAX_ACCOUNTS_PER_FINGERPRINT = 3;
const ACCOUNT_LIMIT_WINDOW = 30 * 24 * 3600;
const VERIFICATION_RESEND_PATH = "/send-verification-email";
export const VERIFICATION_RESEND_COOLDOWN_SECONDS = 12 * 60 * 60;

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
  if (count >= MAX_ACCOUNTS_PER_FINGERPRINT) throw new APIError("TOO_MANY_REQUESTS", { message: "Account creation limit reached for this network" });
}

async function incrementAccountCount(key: string): Promise<void> {
  const ttl = await redis.ttl(key);
  await redis.incr(key);
  if (ttl <= 0) await redis.expire(key, ACCOUNT_LIMIT_WINDOW);
}

export const PASSKEY_VERIFIED_TTL = 5 * 60; // 5 minutes
export const passkeyVerifiedKey = (userId: string) => `passkey-verified:${userId}`;

async function handleSetUserPassword(ctx: HookCtx) {
  const userId = ctx.body?.userId as string | undefined;
  const newPassword = ctx.body?.newPassword as string | undefined;
  if (!userId || !newPassword) throw new APIError("BAD_REQUEST", { message: "userId and newPassword are required" });

  const existingAccount = await db.query.accounts.findFirst({
    where: { AND: [{ userId }, { providerId: "credential" }] },
  });

  if (!existingAccount) {
    const hashedPassword = await hash(newPassword, ARGON2_OPTIONS);
    await db.insert(schema.accounts).values({
      userId,
      accountId: userId,
      issuer: createLocalAccountIssuer("credential"),
      providerId: "credential",
      password: hashedPassword,
    });

    return { context: ctx };
  }
}

async function handleApiKeyCreate(ctx: HookCtx) {
  const session = await getSessionFromCtx(ctx);
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Unauthorized access to this endpoint" });

  const prefix = ctx.body?.prefix;
  if (typeof prefix === "string" && prefix.startsWith("pk_"))
    throw new APIError("BAD_REQUEST", { message: "Publishable API keys can no longer be created" });

  const keys = await db.query.apikeys.findMany({
    where: { referenceId: session.user.id },
  });
  const secretKeyCount = keys.filter((key) => !key.start?.startsWith("pk_")).length;

  if (secretKeyCount >= API_KEYS_LIMIT && session.user.role !== "admin") {
    throw new APIError("FORBIDDEN", {
      message: "You have reached the maximum number of API keys. Please delete an existing key before creating a new one",
    });
  }

  if (session.user.role !== "admin") {
    const cooldownKey = `auth:apikey-cooldown:${session.user.id}`;
    const cooldown = await redis.get(cooldownKey);

    if (cooldown) {
      const ttl = await redis.ttl(cooldownKey);
      const daysLeft = Math.ceil(ttl / 86400);
      throw new APIError("TOO_MANY_REQUESTS", {
        message: `You can only create one API key every 7 days. Try again in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
      });
    }

    await redis.setEx(cooldownKey, API_KEY_COOLDOWN_SECONDS, "1");
  }

  if (ctx.body?.metadata) throw new APIError("BAD_REQUEST", { message: "Metadata is not allowed when creating API keys" });
}

async function handleSignUp(ctx: HookCtx) {
  const usernameValue = ctx.body?.username as string | undefined;
  if (!usernameValue || usernameValue.trim().length === 0) throw new APIError("BAD_REQUEST", { message: "Username is required" });

  const key = getRegistrationKey(ctx);
  if (key) await checkAccountLimit(key);
}

async function handleSocialSignIn(ctx: HookCtx) {
  const key = getRegistrationKey(ctx);
  if (key) await checkAccountLimit(key);
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

const beforeHandlers: Array<{ path: string; handler: (ctx: HookCtx) => Promise<unknown> }> = [
  { path: "/sign-up/email", handler: handleSignUp },
  { path: "/sign-in/social", handler: handleSocialSignIn },
  { path: VERIFICATION_RESEND_PATH, handler: handleVerificationResend },
  { path: "/admin/set-user-password", handler: handleSetUserPassword },
  { path: "/api-key/create", handler: handleApiKeyCreate },
  { path: "/oauth2/create-client", handler: handleOAuthClientWrite },
  { path: "/oauth2/update-client", handler: handleOAuthClientWrite },
];

export const beforeAuthHook = createAuthMiddleware(async (ctx) => {
  for (const { path, handler } of beforeHandlers) {
    if (ctx.path.startsWith(path)) {
      return handler(ctx as HookCtx);
    }
  }
});

export const afterAuthHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === "/passkey/verify-authentication") {
    const returned = ctx.context.returned as { session?: { userId?: string } } | undefined;
    const userId = returned?.session?.userId;
    if (userId) await redis.setEx(passkeyVerifiedKey(userId), PASSKEY_VERIFIED_TTL, "1");
  }

  if (ctx.path === "/sign-up/email") {
    const key = getRegistrationKey(ctx);
    if (key) await incrementAccountCount(key);
  }

  if (ctx.path === "/callback/google" || ctx.path === "/callback/github") {
    const newSession = (ctx.context as { newSession?: { user?: { createdAt?: Date | string } } }).newSession;
    if (newSession?.user?.createdAt) {
      const isNewUser = Date.now() - new Date(newSession.user.createdAt).getTime() < 30_000;
      if (isNewUser) {
        const key = getRegistrationKey(ctx);
        if (key) await incrementAccountCount(key);
      }
    }
  }
});
