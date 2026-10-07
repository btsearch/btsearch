import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { hash, verify } from "@node-rs/argon2";
import * as schema from "@openbts/drizzle";
import { USER_ROLES } from "@openbts/shared/contract";
import { type GenericEndpointContext, betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";
import { admin, jwt, lastLoginMethod, multiSession, twoFactor, username } from "better-auth/plugins";
import type { FastifyRequest } from "fastify";
import { AsyncLocalStorage } from "node:async_hooks";

import { baseUrl } from "../config.js";
import { APP_NAME, ARGON2_OPTIONS } from "../constants.js";
import { db } from "../database/psql.js";
import { redis } from "../database/redis.js";
import type { UserRole } from "../interfaces/auth.interface.js";
import { getAuthEmailRecipient, sendPasswordResetEmail, sendVerificationEmail } from "../lib/mail.js";
import { withRedisDeadline } from "../lib/redisDeadline.js";
import { isDisposableEmail, isDisposableEmailBlocklistReady } from "./auth/disposableEmailBlocklist.js";
import {
  afterAuthHook,
  assertSocialSignUpWithinLimit,
  auditLiftedBan,
  beforeAuthHook,
  countSignUp,
  releaseVerificationResendCooldown,
  rememberLiftedBan,
} from "./auth/hooks.js";
import { API_KEY_PERMISSIONS, accessControl, adminRole, editorRole, userRole } from "./auth/permissions.js";
import { OAUTH_SCOPES, OAUTH_USER_SCOPES } from "./auth/scopes.js";

export function mapHeaders(headers: { [s: string]: unknown } | ArrayLike<unknown>) {
  const entries = Object.entries(headers);
  const map = new Map();
  for (const [headerKey, headerValue] of entries) {
    if (headerValue) map.set(headerKey, headerValue);
  }
  return map;
}

const TRUSTED_ORIGIN = process.env.NODE_ENV === "production" ? baseUrl : "https://localhost";
const KEYS_WITHOUT_DATABASE_COPY = ["active-sessions-", "verification:"];
const STORED_ROLES: ReadonlySet<unknown> = new Set(USER_ROLES);
const NAME_MAX_LENGTH = 100;
const CONTROL_CHARACTER = /\p{Cc}/u;

function assertSingleRole(data: object): void {
  if (!("role" in data) || data.role === undefined || STORED_ROLES.has(data.role)) return;
  throw new APIError("BAD_REQUEST", { message: `The role must be one of ${USER_ROLES.join(", ")}` });
}

function assertNameFits(data: object): void {
  if (!("name" in data) || typeof data.name !== "string") return;

  if (data.name.length > NAME_MAX_LENGTH) throw new APIError("BAD_REQUEST", { message: `The name can have at most ${NAME_MAX_LENGTH} characters` });
  if (CONTROL_CHARACTER.test(data.name)) throw new APIError("BAD_REQUEST", { message: "The name cannot contain control characters" });
}

const sessionLookups = new AsyncLocalStorage<true>();

export function asSessionLookup<T>(lookup: () => Promise<T>): Promise<T> {
  return sessionLookups.run(true, lookup);
}

function readStoredAuthValue(key: string): Promise<string | null> {
  const storedKey = `auth:${key}`;
  const canFallBackToDatabase = sessionLookups.getStore() === true && !KEYS_WITHOUT_DATABASE_COPY.some((prefix) => key.startsWith(prefix));
  if (!canFallBackToDatabase) return redis.get(storedKey);
  if (!redis.isReady) return Promise.resolve(null);
  return withRedisDeadline(redis.get(storedKey)).catch(() => null);
}

const DISALLOWED_CHARACTERS = [
  "@",
  "/",
  " ",
  "!",
  "#",
  "$",
  "%",
  "^",
  "&",
  "*",
  "(",
  ")",
  "+",
  "=",
  "{",
  "}",
  "[",
  "]",
  "|",
  "\\",
  ":",
  ";",
  '"',
  "'",
  "<",
  ">",
  ",",
  "?",
];

export const auth = betterAuth({
  appName: APP_NAME,
  user: {
    additionalFields: {
      forceTotp: {
        type: "boolean" as const,
        defaultValue: false,
        input: false,
      },
      locale: {
        type: "string" as const,
        defaultValue: null,
        input: true,
      },
      bio: {
        type: "string" as const,
        defaultValue: null,
        input: true,
      },
    },
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  advanced: {
    cookiePrefix: "openbts",
    database: {
      generateId: false,
      joins: true,
    },
    cookies: {
      session_token: {
        attributes: {
          sameSite: "none",
          secure: true,
        },
      },
    },
  },
  baseURL: baseUrl,
  basePath: "/api/v1/auth",
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      mapProfileToUser: (profile) => {
        return {
          username: profile.email?.split("@")[0] ?? profile.sub,
          image: profile.picture,
          name: profile.name,
          email: profile.email,
          emailVerified: profile.email_verified,
        };
      },
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      mapProfileToUser: (profile) => {
        return {
          username: profile.login,
          image: profile.avatar_url,
          name: profile.name || profile.login,
          email: profile.email,
          emailVerified: !!profile.email,
        };
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: {
      ...schema,
      verifications: schema.verificationTokens,
      apikeys: schema.apikeys,
      jwkss: schema.jwks,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          assertSingleRole(user);
          assertNameFits(user);
          if (!isDisposableEmailBlocklistReady())
            throw new APIError("SERVICE_UNAVAILABLE", { message: "Registration is temporarily unavailable. Please try again later" });
          if (isDisposableEmail(user.email)) throw new APIError("BAD_REQUEST", { message: "Disposable email addresses are not allowed" });
          await assertSocialSignUpWithinLimit(ctx);
        },
        after: async (_user, ctx) => {
          await countSignUp(ctx);
        },
      },
      update: {
        before: async (data, ctx) => {
          assertSingleRole(data);
          assertNameFits(data);
          rememberLiftedBan(data, ctx);
        },
        after: async (user, ctx) => {
          await auditLiftedBan(user, ctx);
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url, getAuthEmailRecipient(user));
    },
    password: {
      hash: async (password) => {
        const hashedPwd = await hash(password, ARGON2_OPTIONS);
        return hashedPwd;
      },
      verify: async (data: { password: string; hash: string }) => {
        const { password, hash } = data;
        const isValid = await verify(hash, password, ARGON2_OPTIONS);
        return isValid;
      },
    },
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }, request) => {
      try {
        await sendVerificationEmail(user.email, url, getAuthEmailRecipient(user));
      } catch (error) {
        await releaseVerificationResendCooldown(user.email, request);
        throw error;
      }
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  hooks: {
    before: beforeAuthHook,
    after: afterAuthHook,
  },
  plugins: [
    admin({
      ac: accessControl,
      adminRoles: ["admin"],
      defaultRole: "user" as UserRole,
      roles: {
        admin: adminRole,
        editor: editorRole,
        user: userRole,
      },
    }),
    apiKey({
      apiKeyHeaders: ["authorization"],
      enableMetadata: true,
      defaultPrefix: "sk_",
      permissions: {
        defaultPermissions: async (_referenceId: string, _ctx: GenericEndpointContext) => API_KEY_PERMISSIONS,
      },
      rateLimit: {
        enabled: false,
      },
    }),
    jwt(),
    lastLoginMethod(),
    multiSession(),
    oauthProvider({
      loginPage: `${TRUSTED_ORIGIN}/`,
      consentPage: `${TRUSTED_ORIGIN}/`,
      scopes: OAUTH_SCOPES,
      clientRegistrationDefaultScopes: OAUTH_USER_SCOPES,
      clientRegistrationAllowedScopes: OAUTH_USER_SCOPES,
      refreshTokenReuseInterval: 30,
      prefix: {
        opaqueAccessToken: "oat_",
        refreshToken: "ort_",
        clientSecret: "ocs_",
      },
    }),
    username({
      minUsernameLength: 3,
      maxUsernameLength: 25,
      usernameValidator: (username) => {
        if (["admin", "administrator", "mod", "moderator"].includes(username)) return false;
        if (DISALLOWED_CHARACTERS.some((char) => username.includes(char))) return false;
        return true;
      },
    }),
    passkey({
      rpID: process.env.NODE_ENV === "production" ? "btsearch.pl" : "localhost",
      rpName: APP_NAME,
      advanced: {
        webAuthnChallengeCookie: "webauthn_challenge",
      },
    }),
    twoFactor({
      issuer: APP_NAME,
    }),
  ],
  telemetry: {
    enabled: false,
  },
  rateLimit: {
    enabled: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    storeSessionInDatabase: true,
  },
  secondaryStorage: {
    get: async (key) => {
      const value = await readStoredAuthValue(key);
      return value ? value : null;
    },
    getAndDelete: async (key) => {
      const value = await redis.getDel(`auth:${key}`);
      return value ? value : null;
    },
    increment: async (key, ttl) => {
      const redisKey = `auth:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, ttl);
      return count;
    },
    set: async (key, value, ttl) => {
      if (ttl) await redis.setEx(`auth:${key}`, ttl, value);
      else await redis.set(`auth:${key}`, value);
    },
    delete: async (key) => {
      await redis.del(`auth:${key}`);
    },
  },
  trustedOrigins: [TRUSTED_ORIGIN],
  disabledPaths: ["/is-username-available", "/token"],
});

export function getCurrentUser(req: FastifyRequest) {
  return asSessionLookup(() => auth.api.getSession({ headers: fromNodeHeaders(req.headers) }));
}

export function verifyApiKey(key: string, requiredPermissions?: Record<string, string[]>) {
  return auth.api.verifyApiKey({
    body: { key, permissions: requiredPermissions },
  });
}
