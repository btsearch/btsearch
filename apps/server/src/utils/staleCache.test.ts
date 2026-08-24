import assert from "node:assert/strict";
import test from "node:test";

import { type StaleCacheStore, withStaleCache } from "./staleCache.ts";

class FakeCacheStore implements StaleCacheStore {
  readonly values = new Map<string, string>();
  private readonly acquisitionResults: boolean[];
  acquireAttempts = 0;
  writes = 0;
  lockHeld = false;

  constructor(acquisitionResults: boolean[]) {
    this.acquisitionResults = acquisitionResults;
  }

  async read(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async tryAcquireLock(): Promise<boolean> {
    const acquired = this.acquisitionResults[this.acquireAttempts++] ?? false;
    if (acquired) this.lockHeld = true;
    return acquired;
  }

  async write(key: string, _ttlSeconds: number, value: string): Promise<void> {
    this.writes++;
    this.values.set(key, value);
  }

  async releaseLock(): Promise<void> {
    this.lockHeld = false;
  }
}

void test("retries lock acquisition after a cold waiter times out", async () => {
  const store = new FakeCacheStore([false, true]);
  const result = await withStaleCache(
    store,
    "terrain",
    { freshTtlSeconds: 60, staleTtlSeconds: 120, waitForLockMs: 0 },
    async () => {
      assert.equal(store.lockHeld, true);
      return { status: "available" };
    },
  );

  assert.equal(store.acquireAttempts, 2);
  assert.equal(store.writes, 1);
  assert.equal(result.fromCache, false);
});

void test("loads without the lock once the lock wait deadline passes", async () => {
  const store = new FakeCacheStore([false]);
  const result = await withStaleCache(
    store,
    "terrain",
    { freshTtlSeconds: 60, staleTtlSeconds: 120, waitForLockMs: 0, lockWaitDeadlineMs: 0 },
    async () => {
      assert.equal(store.lockHeld, false);
      return { status: "available" };
    },
  );

  assert.equal(store.acquireAttempts, 1);
  assert.equal(store.writes, 1);
  assert.equal(result.fromCache, false);
});

void test("does not persist a value rejected by the cache policy", async () => {
  const store = new FakeCacheStore([true]);
  const result = await withStaleCache(
    store,
    "terrain",
    {
      freshTtlSeconds: 60,
      staleTtlSeconds: 120,
      shouldCache: (value) => value.status !== "unavailable",
    },
    async () => ({ status: "unavailable" }),
  );

  assert.equal(store.writes, 0);
  assert.deepEqual(result.value, { status: "unavailable" });
});
