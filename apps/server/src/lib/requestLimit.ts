import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../errors.js";
import type { RateLimitTier, RouteRateLimit } from "../plugins/ratelimit/rateLimiter.js";

export type RetryHeaders = { header(name: string, value: string): unknown };

export const UNLIMITED: RateLimitTier = { max: Number.POSITIVE_INFINITY, window: 300 };

export async function countAgainstLimit(req: FastifyRequest, res: RetryHeaders, limit: RouteRateLimit): Promise<void> {
  const limiter = req.server.rateLimitService;
  const key = limiter.generateKey(req, limit);
  if (key === null) throw new ErrorResponse("TOO_MANY_REQUESTS");

  const tier = await limiter.getRateLimitTier(req, limit);
  const result = await limiter.check(key, tier).catch(() => null);
  if (result === null) throw new ErrorResponse("SERVICE_UNAVAILABLE");
  if (result.allowed) return;

  res.header("X-Retry-After", String(result.retryAfter ?? limit.window));
  throw new ErrorResponse("TOO_MANY_REQUESTS");
}
