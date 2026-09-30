import { apikeys } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { API_KEYS_LIMIT, API_KEY_COOLDOWN_KEY_PREFIX } from "../../../../constants.js";
import db from "../../../../database/psql.js";
import { redis } from "../../../../database/redis.js";
import { ErrorResponse } from "../../../../errors.js";
import type { TokenTier } from "../../../../interfaces/auth.interface.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { DEFAULT_QUOTA_LIMITS } from "../../../../plugins/ratelimit/quota.js";
import { DEFAULT_PK_TIER_LIMITS, DEFAULT_TIER_LIMITS } from "../../../../plugins/ratelimit/rateLimiter.js";

const apiKeySchema = createSelectSchema(apikeys)
  .pick({ id: true, name: true, start: true, expiresAt: true, createdAt: true, enabled: true })
  .extend({
    rateLimit: z.object({
      used: z.number(),
      max: z.number().nullable(),
      window: z.number(),
      reset: z.number().nullable(),
    }),
    quota: z.object({
      used: z.number(),
      max: z.number().nullable(),
      window: z.number(),
      reset: z.number().nullable(),
    }),
  });

const limitsSchema = z.object({
  maxKeys: z.number().nullable(),
  nextCreateAt: z.string().nullable(),
});

const schemaRoute = {
  response: {
    200: z.object({
      data: z.array(apiKeySchema),
      limits: limitsSchema,
    }),
  },
};

type ApiKeyResponse = z.infer<typeof apiKeySchema>;
type ResponseBody = { data: ApiKeyResponse[]; limits: z.infer<typeof limitsSchema> };

async function handler(req: FastifyRequest, res: ReplyPayload<JSONBody<ResponseBody>>) {
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");

  const keys = await db.query.apikeys.findMany({
    where: { referenceId: session.user.id },
    columns: {
      id: true,
      name: true,
      start: true,
      expiresAt: true,
      createdAt: true,
      enabled: true,
      metadata: true,
    },
  });

  const result: ApiKeyResponse[] = await Promise.all(
    keys.map(async (key) => {
      let tier: TokenTier = "basic";
      let isPublishable = false;
      try {
        if (key.metadata) {
          const meta = JSON.parse(key.metadata) as { tier?: TokenTier; type?: string };
          tier = meta.tier ?? "basic";
          isPublishable = meta.type === "publishable";
        }
      } catch {
        // malformed metadata, default to basic
      }
      const tierLimits = isPublishable ? DEFAULT_PK_TIER_LIMITS : DEFAULT_TIER_LIMITS;
      const limits = tierLimits[tier] ?? tierLimits.basic;

      const redisKey = isPublishable ? `ratelimit:pk:${key.id}` : `ratelimit:api:${key.id}`;
      const quotaRedisKey = `quota:api:${key.id}`;
      const [countStr, ttl, quotaCountStr, quotaTtl] = await Promise.all([
        redis.get(redisKey),
        redis.ttl(redisKey),
        redis.get(quotaRedisKey),
        redis.ttl(quotaRedisKey),
      ]);
      const used = countStr ? Number.parseInt(countStr, 10) : 0;
      const quotaUsed = quotaCountStr ? Number.parseInt(quotaCountStr, 10) : 0;
      const quotaLimits = DEFAULT_QUOTA_LIMITS[tier] ?? DEFAULT_QUOTA_LIMITS.basic;

      return {
        id: key.id,
        name: key.name,
        start: key.start,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        enabled: key.enabled,
        rateLimit: {
          used,
          max: Number.isFinite(limits.max) ? limits.max : null,
          window: limits.window,
          reset: ttl > 0 ? Math.floor(Date.now() / 1000) + ttl : null,
        },
        quota: {
          used: quotaUsed,
          max: Number.isFinite(quotaLimits.max) ? quotaLimits.max : null,
          window: quotaLimits.window,
          reset: quotaTtl > 0 ? Math.floor(Date.now() / 1000) + quotaTtl : null,
        },
      };
    }),
  );

  const isAdmin = session.user.role === "admin";
  const cooldownTtl = isAdmin ? 0 : await redis.ttl(`${API_KEY_COOLDOWN_KEY_PREFIX}${session.user.id}`);

  return res.send({
    data: result,
    limits: {
      maxKeys: isAdmin ? null : API_KEYS_LIMIT,
      nextCreateAt: cooldownTtl > 0 ? new Date(Date.now() + cooldownTtl * 1000).toISOString() : null,
    },
  });
}

const getAccountApiKeys: Route<object, ResponseBody> = {
  url: "/account/api-keys",
  method: "GET",
  schema: schemaRoute,
  handler,
};

export default getAccountApiKeys;
