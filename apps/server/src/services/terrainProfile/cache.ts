import redis from "../../database/redis.js";
import { acquireRedisLock, releaseOwnedRedisLock } from "../../utils/redisLock.js";
import { type CacheOptions, type CacheResult, type StaleCacheStore, withStaleCache } from "../../utils/staleCache.js";

const redisStore: StaleCacheStore = {
  read: (key) => redis.get(key),
  async tryAcquireLock(key, token, ttlSeconds) {
    return acquireRedisLock(key, token, ttlSeconds);
  },
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
