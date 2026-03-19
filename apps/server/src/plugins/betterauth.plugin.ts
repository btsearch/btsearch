import { fromNodeHeaders } from "better-auth/node";
import { betterAuth, type GenericEndpointContext } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { admin, multiSession, twoFactor, username } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { hash, verify } from "@node-rs/argon2";
import * as schema from "@openbts/drizzle";

import { db } from "../database/psql.js";
import { redis } from "../database/redis.js";
import { APP_NAME, ARGON2_OPTIONS } from "../constants.js";
import { accessControl, adminRole, editorRole, userRole } from "./auth/permissions.js";
import { beforeAuthHook, afterAuthHook } from "./auth/hooks.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/mail.js";

import type { FastifyRequest } from "fastify";
import type { UserRole } from "../interfaces/auth.interface.js";

export function mapHeaders(headers: { [s: string]: unknown } | ArrayLike<unknown>) {
  const entries = Object.entries(headers);
  const map = new Map();
  for (const [headerKey, headerValue] of entries) {
    if (headerValue) map.set(headerKey, headerValue);
  }
  return map;
}

const TRUSTED_ORIGIN = process.env.NODE_ENV === "production" ? "https://btsearch.pl" : "https://localhost";

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
  baseURL: process.env.NODE_ENV === "production" ? process.env.BASE_URL : "http://localhost:3030",
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
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url);
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
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  experimental: { joins: true },
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
      permissions: {
        defaultPermissions: async (_referenceId: string, _ctx: GenericEndpointContext) => {
          return {
            cells: ["read"],
            stations: ["read"],
            operators: ["read"],
            locations: ["read"],
            bands: ["read"],
            uke_permits: ["read"],
            uke_radiolines: ["read"],
          };
        },
      },
    }),
    multiSession(),
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
  },
  secondaryStorage: {
    get: async (key) => {
      const value = await redis.get(`auth:${key}`);
      return value ? value : null;
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
  disabledPaths: ["/is-username-available"],
});

export function getCurrentUser(req: FastifyRequest) {
  return auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
}

export function verifyApiKey(apiKey: string, requiredPermissions?: Record<string, string[]>) {
  return auth.api.verifyApiKey({
    body: {
      key: apiKey,
      permissions: requiredPermissions,
    },
  });
}
