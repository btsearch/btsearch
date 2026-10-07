import type { redis } from "../../database/redis.js";
import { withRedisDeadline } from "../../lib/redisDeadline.js";

const HIT_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])
if ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}`;
const PAUSE_AFTER_FAILURE_MS = 5_000;

let pausedUntil = 0;

export type CounterHit = { count: number; ttl: number };

export class CounterPausedError extends Error {}

export async function hitCounter(client: typeof redis, key: string, windowSeconds: number): Promise<CounterHit> {
  if (Date.now() < pausedUntil) throw new CounterPausedError("Redis counters are paused after a failure");

  try {
    if (!client.isReady) throw new Error("Redis is not connected");

    const reply: unknown = await withRedisDeadline(client.eval(HIT_SCRIPT, { keys: [key], arguments: [String(windowSeconds)] }));
    const [count, ttl]: unknown[] = Array.isArray(reply) ? reply : [];
    if (typeof count !== "number" || typeof ttl !== "number") throw new Error("Unexpected reply from the Redis counter");
    return { count, ttl };
  } catch (error) {
    pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
    throw error;
  }
}
