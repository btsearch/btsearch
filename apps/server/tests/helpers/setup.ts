import { afterEach, beforeEach, vi } from "vitest";

import { getDefaultRuntimeSettings, getRuntimeSettings } from "../../src/lib/runtimeSettings.js";
import { resetBoundaries } from "./boundaries.js";
import { closeRouteHarnesses } from "./routeHarness.js";

vi.mock("../../src/database/psql.js", async () => {
  const { dbMock } = await import("./boundaries.js");
  return { db: dbMock, default: dbMock };
});
vi.mock("@openbts/drizzle/db", async () => {
  const { dbMock } = await import("./boundaries.js");
  return { db: dbMock, default: dbMock };
});
vi.mock("../../src/database/redis.js", async () => {
  const { redisMock } = await import("./boundaries.js");
  return { redis: redisMock, default: redisMock, redisReady: Promise.resolve() };
});
vi.mock("../../src/plugins/betterauth.plugin.js", async () => {
  const { authBoundary } = await import("./boundaries.js");
  return authBoundary;
});
vi.mock("../../src/utils/logger.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }, flushLogs: vi.fn(async () => undefined) };
});

beforeEach(() => {
  resetBoundaries();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected HTTP request in a unit test");
    }),
  );
  Object.assign(getRuntimeSettings(), getDefaultRuntimeSettings());
});
afterEach(async () => {
  await closeRouteHarnesses();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
