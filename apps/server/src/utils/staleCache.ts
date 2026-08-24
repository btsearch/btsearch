import { randomUUID } from "node:crypto";

type CacheEnvelope<T> = {
  freshUntil: number;
  value: T;
};

export type CacheResult<T> = {
  value: T;
  fromCache: boolean;
  stale: boolean;
};

export type CacheOptions<T> = {
  freshTtlSeconds: number;
  staleTtlSeconds: number;
  lockTtlSeconds?: number;
  waitForLockMs?: number;
  lockWaitDeadlineMs?: number;
  shouldCache?: (value: T) => boolean;
};

export type StaleCacheStore = {
  read(key: string): Promise<string | null>;
  tryAcquireLock(key: string, token: string, ttlSeconds: number): Promise<boolean>;
  write(key: string, ttlSeconds: number, value: string): Promise<void>;
  releaseLock(key: string, token: string): Promise<void>;
};

function parseEnvelope<T>(raw: string | null): CacheEnvelope<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (typeof parsed.freshUntil !== "number" || !("value" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readEnvelope<T>(store: StaleCacheStore, key: string): Promise<CacheEnvelope<T> | null> {
  return parseEnvelope<T>(await store.read(key));
}

async function waitForValue<T>(store: StaleCacheStore, key: string, waitMs: number): Promise<CacheEnvelope<T> | null> {
  const deadline = Date.now() + waitMs;

  async function poll(): Promise<CacheEnvelope<T> | null> {
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const cached = await readEnvelope<T>(store, key);
    if (cached) return cached;
    return poll();
  }

  return poll();
}

export async function withStaleCache<T>(
  store: StaleCacheStore,
  key: string,
  options: CacheOptions<T>,
  loader: () => Promise<T>,
): Promise<CacheResult<T>> {
  const cached = await readEnvelope<T>(store, key);
  if (cached && cached.freshUntil > Date.now()) return { value: cached.value, fromCache: true, stale: false };

  const lockKey = `${key}:lock`;
  const lockToken = randomUUID();
  const lockTtlSeconds = options.lockTtlSeconds ?? 30;
  const lockWaitDeadline = Date.now() + (options.lockWaitDeadlineMs ?? 60_000);
  let acquired = await store.tryAcquireLock(lockKey, lockToken, lockTtlSeconds);

  while (!acquired) {
    if (cached) return { value: cached.value, fromCache: true, stale: true };
    if (Date.now() >= lockWaitDeadline) break;
    // oxlint-disable-next-line no-await-in-loop
    const waited = await waitForValue<T>(store, key, options.waitForLockMs ?? 5_000);
    if (waited) return { value: waited.value, fromCache: true, stale: waited.freshUntil <= Date.now() };
    // oxlint-disable-next-line no-await-in-loop
    acquired = await store.tryAcquireLock(lockKey, lockToken, lockTtlSeconds);
  }

  try {
    const value = await loader();
    if (options.shouldCache && !options.shouldCache(value)) {
      if (cached) return { value: cached.value, fromCache: true, stale: true };
      return { value, fromCache: false, stale: false };
    }
    const envelope: CacheEnvelope<T> = {
      freshUntil: Date.now() + options.freshTtlSeconds * 1000,
      value,
    };
    await store.write(key, options.staleTtlSeconds, JSON.stringify(envelope));
    return { value, fromCache: false, stale: false };
  } catch (error) {
    if (cached) return { value: cached.value, fromCache: true, stale: true };
    throw error;
  } finally {
    if (acquired) await store.releaseLock(lockKey, lockToken).catch(() => undefined);
  }
}
