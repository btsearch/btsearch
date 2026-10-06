import type { FastifyReply, FastifyRequest } from "fastify";

import { redis } from "../database/redis.js";
import { ErrorResponse } from "../errors.js";
import type { FastifyZodInstance } from "../interfaces/fastify.interface.js";
import { isHealthProbe } from "../utils/healthProbe.js";
import { isNetMonsterExport } from "../utils/netMonster.js";
import { QuotaService } from "./ratelimit/quota.js";
import { type RateLimitReservation, RateLimitService } from "./ratelimit/rateLimiter.js";

declare module "fastify" {
  interface FastifyInstance {
    rateLimitService: RateLimitService;
    quotaService: QuotaService;
  }

  interface FastifyRequest {
    successfulOnlyRateLimitReservation?: RateLimitReservation;
  }
}

export const registerRateLimit = (fastify: FastifyZodInstance) => {
  const rateLimitService = new RateLimitService(redis, {
    routes: [
      { url: "/api/v1/auth/sign-in/email", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-in/username", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-in/social", max: 10, window: 300 },
      { url: "/api/v1/auth/passkey/verify-authentication", max: 10, window: 300 },
      { url: "/api/v1/auth/two-factor/verify-totp", max: 10, window: 300 },
      { url: "/api/v1/auth/two-factor/verify-otp", max: 10, window: 300 },
      { url: "/api/v1/auth/two-factor/verify-backup-code", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-up/email", max: 3, window: 3600 },
      { url: "/api/v1/auth/callback/google", max: 10, window: 300 },
      { url: "/api/v1/auth/callback/github", max: 10, window: 300 },
      { url: "/api/v1/auth/request-password-reset", max: 5, window: 300 },
      { url: "/api/v1/auth/reset-password", max: 5, window: 300 },
      { url: "/api/v1/admin/users/:userId/resend-verification", max: 5, window: 300, keyParam: "userId" },
      { url: "/api/v1/auth/oauth2/token", max: 20, window: 60 },
      { url: "/api/v1/auth/oauth2/authorize", max: 30, window: 60 },
      { url: "/api/v1/auth/oauth2/consent", max: 15, window: 60 },
      { url: "/api/v1/auth/oauth2/create-client", max: 10, window: 3600 },
      { url: "/public/og/:resource/:file", max: 12, window: 60 },
      {
        url: "/api/v2/cells/export",
        max: 10,
        window: 300,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      {
        url: "/api/v2/cells/match",
        max: 30,
        window: 60,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 60 }, editor: { max: 120, window: 60 } },
      },
      {
        url: "/api/v1/terrain-profile/analyses",
        max: 15,
        window: 300,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      { url: "/api/v1/terrain-profile/analyses/:analysis_id", max: 120, window: 60 },
      { url: "/api/v2/terrain-profiles/:id", max: 120, window: 60 },
      {
        url: "/api/v1/geocoding/search",
        max: 20,
        window: 60,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      {
        url: "/api/v1/geocoding/reverse",
        max: 5,
        window: 60,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      {
        url: "/api/v2/geocoding/search",
        max: 20,
        window: 60,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      {
        url: "/api/v2/geocoding/reverse",
        max: 5,
        window: 60,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
    ],
  });

  const quotaService = new QuotaService(redis);

  fastify.decorate("rateLimitService", rateLimitService);
  fastify.decorate("quotaService", quotaService);
  fastify.addHook("preHandler", async (req: FastifyRequest, res: FastifyReply) => {
    if (isNetMonsterExport(req)) return;
    if (req.url.startsWith("/uploads/")) return;
    if (isHealthProbe(req)) return;

    const result = await rateLimitService.processRequest(req);
    if (!result) throw new ErrorResponse("TOO_MANY_REQUESTS");
    if ("isUnavailable" in result) {
      if (result.hasRouteLimit) throw new ErrorResponse("SERVICE_UNAVAILABLE");
      return;
    }

    if (!result.allowed) {
      res.header("X-Retry-After", result.retryAfter?.toString() || "60");
      throw new ErrorResponse("TOO_MANY_REQUESTS");
    }
    if (result.reservation) req.successfulOnlyRateLimitReservation = result.reservation;

    res.header("X-RateLimit-Limit", result.limit.toString());
    res.header("X-RateLimit-Remaining", result.remaining.toString());
    res.header("X-RateLimit-Reset", result.reset.toString());

    const quota = await quotaService.processRequest(req);
    if (quota) {
      if (!quota.allowed) {
        res.header("X-Retry-After", quota.retryAfter?.toString() || "3600");
        throw new ErrorResponse("QUOTA_EXCEEDED");
      }

      res.header("X-Quota-Limit", quota.limit.toString());
      res.header("X-Quota-Remaining", quota.remaining.toString());
      res.header("X-Quota-Reset", quota.reset.toString());
    }
  });

  fastify.addHook("onResponse", async (req: FastifyRequest, res: FastifyReply) => {
    const reservation = req.successfulOnlyRateLimitReservation;
    if (!reservation) return;
    if (res.statusCode >= 200 && res.statusCode < 400) return;

    await rateLimitService.release(reservation);
  });
};
