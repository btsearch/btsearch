import type { FastifyReply, FastifyRequest } from "fastify";

import { redis } from "../database/redis.js";
import { ErrorResponse } from "../errors.js";
import type { FastifyZodInstance } from "../interfaces/fastify.interface.js";
import { QuotaService } from "../services/quota.service.js";
import { type RateLimitReservation, RateLimitService } from "../services/ratelimit.service.js";

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
      {
        url: "/api/v1/submissions/batch",
        max: 4,
        window: 115200,
        countSuccessfulOnly: true,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 86400 }, editor: { max: 500, window: 60 } },
      },
      { url: "/api/v1/auth/sign-in", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-in/email", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-in/passkey", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-in/social", max: 10, window: 300 },
      { url: "/api/v1/auth/sign-up", max: 3, window: 3600 },
      { url: "/api/v1/auth/sign-up/email", max: 3, window: 3600 },
      { url: "/api/v1/auth/callback/google", max: 10, window: 300 },
      { url: "/api/v1/auth/callback/github", max: 10, window: 300 },
      { url: "/api/v1/auth/forget-password", max: 5, window: 300 },
      { url: "/api/v1/auth/reset-password", max: 5, window: 300 },
      { url: "/api/v1/auth/oauth2/token", max: 20, window: 60 },
      { url: "/api/v1/auth/oauth2/authorize", max: 30, window: 60 },
      { url: "/api/v1/auth/oauth2/consent", max: 15, window: 60 },
      { url: "/api/v1/auth/oauth2/create-client", max: 10, window: 3600 },
      { url: "/public/og/:resource/:file", max: 12, window: 60 },
      {
        url: "/api/v1/terrain-profile/analyses",
        max: 15,
        window: 300,
        roles: { admin: { max: Number.POSITIVE_INFINITY, window: 300 }, editor: { max: Number.POSITIVE_INFINITY, window: 300 } },
      },
      { url: "/api/v1/terrain-profile/analyses/:analysis_id", max: 120, window: 60 },
    ],
  });

  const quotaService = new QuotaService(redis);

  fastify.decorate("rateLimitService", rateLimitService);
  fastify.decorate("quotaService", quotaService);
  fastify.addHook("preHandler", async (req: FastifyRequest, res: FastifyReply) => {
    const netMonsterUserAgent = process.env.NTM_USERAGENT || null;
    const isNetMonsterExport = netMonsterUserAgent && req.headers["user-agent"]?.startsWith(netMonsterUserAgent) && req.url.includes("/cells/export");
    if (isNetMonsterExport) return;
    if (req.url.startsWith("/uploads/")) return;
    if (req.url === "/api/v1/health") return;

    const result = await rateLimitService.processRequest(req);
    if (!result) {
      throw new ErrorResponse("TOO_MANY_REQUESTS");
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
