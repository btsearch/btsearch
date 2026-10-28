import redis from "../../database/redis.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";

const STATISTICS_CACHE = { freshTtlSeconds: 600, staleTtlSeconds: 86_400 };

export async function cachedStatistics<T>(name: string, load: () => Promise<T>): Promise<T> {
  if (!redis.isReady) return load();

  const { value } = await withRedisStaleCache(`statistics:v2:${name}`, STATISTICS_CACHE, load);
  return value;
}
