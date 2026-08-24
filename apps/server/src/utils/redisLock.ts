import redis from "../database/redis.js";

const REFRESH_SCRIPT = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('expire',KEYS[1],ARGV[2]) else return 0 end";
const RELEASE_SCRIPT = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";

export async function acquireRedisLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.set(key, token, {
    condition: "NX",
    expiration: { type: "EX", value: ttlSeconds },
  });
  return result !== null;
}

export async function refreshOwnedRedisLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
  const result = await redis.eval(REFRESH_SCRIPT, { keys: [key], arguments: [token, String(ttlSeconds)] });
  return result === 1;
}

export async function releaseOwnedRedisLock(key: string, token: string): Promise<boolean> {
  const result = await redis.eval(RELEASE_SCRIPT, { keys: [key], arguments: [token] });
  return result === 1;
}
