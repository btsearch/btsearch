import type { FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod/v4";

import { IDEMPOTENCY_LOCK_SECONDS, IDEMPOTENCY_REPLAY_MAX_BYTES, IDEMPOTENCY_REPLAY_SECONDS } from "../constants.js";
import redis from "../database/redis.js";
import { ErrorResponse } from "../errors.js";
import { getRequestPathname } from "../features/seo/routes.js";
import { withRedisDeadline } from "../lib/redisDeadline.js";

const REPLAYED_HEADER = "idempotent-replayed";
const REPLAYED_HEADERS = ["content-type", "location"];
const TOO_MANY_REQUESTS = 429;

const answerSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  body: z.string().nullable(),
});
const keyRecordSchema = z.object({ fingerprint: z.string(), answer: answerSchema.optional() });

type HeldKey = { redisKey: string; fingerprint: string };
type Answer = z.infer<typeof answerSchema>;
type KeyRecord = z.infer<typeof keyRecordSchema>;

const heldKeys = new WeakMap<FastifyRequest, HeldKey>();

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

function callerOf(req: FastifyRequest): string | null {
  if (req.oauthToken) return `oauth:${req.oauthToken.clientId}:${req.oauthToken.userId}`;
  if (req.apiToken) return `api:${req.apiToken.id}`;
  if (req.userSession) return `user:${req.userSession.user.id}`;
  return null;
}

function readKeyRecord(stored: string | null): KeyRecord | null {
  if (stored === null) return null;
  try {
    return keyRecordSchema.parse(JSON.parse(stored));
  } catch {
    return null;
  }
}

function isKeptStatus(status: number): boolean {
  return (status >= 200 && status < 300) || (status >= 400 && status < 500 && status !== TOO_MANY_REQUESTS);
}

function answerOf(res: FastifyReply, payload: unknown): Answer | null {
  if (!isKeptStatus(res.statusCode)) return null;
  if (payload !== undefined && payload !== null && typeof payload !== "string") return null;
  if (typeof payload === "string" && Buffer.byteLength(payload) > IDEMPOTENCY_REPLAY_MAX_BYTES) return null;

  const headers = Object.fromEntries(
    REPLAYED_HEADERS.flatMap((name) => {
      const value = res.getHeader(name);
      return typeof value === "string" ? [[name, value]] : [];
    }),
  );
  return { status: res.statusCode, headers, body: payload ?? null };
}

export async function idempotencyHook(req: FastifyRequest, res: FastifyReply) {
  if (req.method !== "POST") return;
  if (res.sent) return;

  const key = req.headers["x-idempotency-key"];
  if (!key || typeof key !== "string") return;

  const caller = callerOf(req);
  if (caller === null) return;
  if (!redis.isReady) return;

  const redisKey = `idempotency:${caller}:${digest([getRequestPathname(req.url), key])}`;
  const fingerprint = digest({ query: req.query, body: req.body });

  let acquired: string | null = null;
  try {
    acquired = await withRedisDeadline(redis.set(redisKey, JSON.stringify({ fingerprint }), { NX: true, EX: IDEMPOTENCY_LOCK_SECONDS }));
  } catch {
    return;
  }

  if (acquired !== null) {
    heldKeys.set(req, { redisKey, fingerprint });
    return;
  }

  const earlier = readKeyRecord(await withRedisDeadline(redis.get(redisKey)).catch(() => null));
  if (earlier !== null && earlier.fingerprint !== fingerprint) throw new ErrorResponse("IDEMPOTENCY_KEY_REUSED");
  if (earlier?.answer === undefined) throw new ErrorResponse("DUPLICATE_REQUEST");

  const { status, headers, body } = earlier.answer;
  return res
    .status(status)
    .headers({ ...headers, [REPLAYED_HEADER]: "true" })
    .send(body ?? undefined);
}

export function rememberIdempotentAnswer(req: FastifyRequest, res: FastifyReply, payload: unknown): void {
  const held = heldKeys.get(req);
  if (held === undefined) return;
  heldKeys.delete(req);

  const answer = req.routeOptions.config.idempotentReplay === false ? null : answerOf(res, payload);
  const stored =
    answer === null
      ? redis.del(held.redisKey)
      : redis.setEx(held.redisKey, IDEMPOTENCY_REPLAY_SECONDS, JSON.stringify({ fingerprint: held.fingerprint, answer }));
  stored.catch(() => {});
}
