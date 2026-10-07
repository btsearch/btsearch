import type { FastifyReply, FastifyRequest } from "fastify";

import { IDEMPOTENCY_LOCK_SECONDS } from "../constants.js";
import redis from "../database/redis.js";
import { ErrorResponse } from "../errors.js";
import { withRedisDeadline } from "../lib/redisDeadline.js";

export async function idempotencyHook(req: FastifyRequest, res: FastifyReply) {
  if (req.method !== "POST") return;
  if (res.sent) return;

  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return;

  const redisKey = `idempotency:${key}`;

  if (!redis.isReady) return;

  let acquired: string | null = null;
  try {
    acquired = await withRedisDeadline(redis.set(redisKey, "1", { NX: true, EX: IDEMPOTENCY_LOCK_SECONDS }));
  } catch {
    // Redis unavailable
    return;
  }

  if (acquired === null) throw new ErrorResponse("DUPLICATE_REQUEST");

  if (!req.routeOptions.config.retainIdempotencyKey)
    res.raw.on("finish", () => {
      redis.del(redisKey).catch(() => {});
    });
}
