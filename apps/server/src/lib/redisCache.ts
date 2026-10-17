import redis from "../database/redis.js";
import { logger } from "../utils/logger.js";
import { acquireRedisLock, releaseOwnedRedisLock } from "./redisLock.js";
import { type CacheOptions, type CacheResult, type StaleCacheStore, withStaleCache } from "./staleCache.js";

const redisStore: StaleCacheStore = {
  read: (key) => redis.get(key),
  tryAcquireLock: acquireRedisLock,
  async write(key, ttlSeconds, value) {
    await redis.setEx(key, ttlSeconds, value);
  },
  async releaseLock(key, token) {
    await releaseOwnedRedisLock(key, token);
  },
};

export function withRedisStaleCache<T>(key: string, options: CacheOptions<T>, loader: () => Promise<T>): Promise<CacheResult<T>> {
  return withStaleCache(redisStore, key, options, loader);
}

export async function forgetRedisCache(key: string): Promise<void> {
  if (!redis.isReady) return;
  await redis.del(key).catch((error: unknown) => logger.warn("redis_cache.forget_failed", { key, error }));
}
