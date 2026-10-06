import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let stored: string | null;
let subscriber: ((message: string) => void) | undefined;
let runtime: typeof import("../../src/lib/runtimeSettings.js");

type SettingsBatch = {
  set: (key: string, value: string) => SettingsBatch;
  publish: (channel: string, value: string) => SettingsBatch;
  exec: () => Promise<never[]>;
};

const savedBatch: SettingsBatch = {
  set: vi.fn((_key: string, value: string) => {
    stored = value;
    return savedBatch;
  }),
  publish: vi.fn((_channel: string, _value: string) => savedBatch),
  exec: vi.fn(async () => []),
};

const redisBoundary = {
  get: vi.fn(async () => stored),
  set: vi.fn(async (_key: string, value: string) => {
    stored = value;
    return "OK";
  }),
  duplicate: vi.fn(() => ({
    connect: vi.fn(async () => undefined),
    subscribe: vi.fn(async (_channel: string, listener: (message: string) => void) => {
      subscriber = listener;
    }),
  })),
  multi: vi.fn(() => savedBatch),
};

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  stored = null;
  subscriber = undefined;
  vi.clearAllMocks();
  vi.doMock("../../src/database/redis.js", () => ({ redis: redisBoundary }));
  runtime = await import("../../src/lib/runtimeSettings.js");
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function olderSettings(): Record<string, unknown> {
  const settings = {
    ...runtime.getDefaultRuntimeSettings(),
    submissionsEnabled: false,
    photosEnabled: false,
    allowedUnauthenticatedRoutes: ["/api/v2/settings"],
    announcement: { enabled: true, type: "warning", message: "Stored announcement" },
  };
  Reflect.deleteProperty(settings, "structureOwnerProposalsEnabled");
  return settings;
}

describe("getDefaultRuntimeSettings", () => {
  it("allows structure owner proposals by default", () => {
    expect(runtime.getDefaultRuntimeSettings().structureOwnerProposalsEnabled).toBe(true);
  });
});

describe("mergeRuntimeSettings", () => {
  it("preserves an explicit false and unrelated settings in a partial feature update", () => {
    const before = { ...runtime.getDefaultRuntimeSettings(), photosEnabled: false };
    const disabled = runtime.mergeRuntimeSettings(before, { structureOwnerProposalsEnabled: false });
    expect(disabled).toEqual({ ...before, structureOwnerProposalsEnabled: false });
    expect(runtime.mergeRuntimeSettings(disabled, { submissionsEnabled: false })).toEqual({
      ...disabled,
      submissionsEnabled: false,
    });
  });
});

describe("initRuntimeSettings", () => {
  it("defaults the missing proposal flag to true without resetting older settings", async () => {
    const older = olderSettings();
    stored = JSON.stringify(older);
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, structureOwnerProposalsEnabled: true });
  });

  it("keeps a stored explicit false after initialization", async () => {
    const settings = { ...runtime.getDefaultRuntimeSettings(), structureOwnerProposalsEnabled: false, submissionsEnabled: false };
    stored = JSON.stringify(settings);
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual(settings);
  });

  it.each([null, "false"])("does not repair an explicitly invalid startup flag %s into a persisted boolean", async (invalid) => {
    stored = JSON.stringify({ ...runtime.getDefaultRuntimeSettings(), structureOwnerProposalsEnabled: invalid });
    const invalidStored = stored;
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual(runtime.getDefaultRuntimeSettings());
    expect(redisBoundary.set).not.toHaveBeenCalled();
    expect(stored).toBe(invalidStored);
  });
});

describe("saveRuntimeSettings", () => {
  it("stores and publishes an explicit false together with the other settings", async () => {
    const settings = { ...runtime.getDefaultRuntimeSettings(), structureOwnerProposalsEnabled: false, photosEnabled: false };
    await runtime.saveRuntimeSettings(settings);
    expect(savedBatch.set).toHaveBeenCalledWith("runtime:settings", JSON.stringify(settings));
    expect(savedBatch.publish).toHaveBeenCalledWith("runtime:settings:updates", JSON.stringify(settings));
    expect(savedBatch.exec).toHaveBeenCalledOnce();
    expect(runtime.getRuntimeSettings()).toEqual(settings);
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(settings);
  });
});

describe("loadStoredRuntimeSettings", () => {
  it("defaults only the missing flag when reading older settings", async () => {
    const older = olderSettings();
    stored = JSON.stringify(older);
    expect(await runtime.loadStoredRuntimeSettings()).toEqual({ ...older, structureOwnerProposalsEnabled: true });
  });

  it.each([null, "false", 0])("rejects an invalid stored proposal flag %s without replacing current settings", async (invalid) => {
    const current = runtime.getRuntimeSettings();
    current.structureOwnerProposalsEnabled = false;
    current.photosEnabled = false;
    stored = JSON.stringify({ ...runtime.getDefaultRuntimeSettings(), structureOwnerProposalsEnabled: invalid });
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(current);
    expect(runtime.getRuntimeSettings()).toEqual(current);
  });
});

describe("runtime settings subscription", () => {
  it("accepts an older published settings object without resetting its other fields", async () => {
    await runtime.initRuntimeSettings();
    const older = olderSettings();
    subscriber!(JSON.stringify(older));
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, structureOwnerProposalsEnabled: true });
  });

  it("applies an explicit false from another settings writer", async () => {
    await runtime.initRuntimeSettings();
    const next = { ...runtime.getRuntimeSettings(), structureOwnerProposalsEnabled: false };
    subscriber!(JSON.stringify(next));
    expect(runtime.getRuntimeSettings()).toEqual(next);
  });

  it.each([null, "false"])("ignores an invalid published proposal flag %s", async (invalid) => {
    await runtime.initRuntimeSettings();
    const before = structuredClone(runtime.getRuntimeSettings());
    subscriber!(JSON.stringify({ ...before, structureOwnerProposalsEnabled: invalid, photosEnabled: false }));
    expect(runtime.getRuntimeSettings()).toEqual(before);
  });
});

describe("runtime settings resynchronization", () => {
  it("accepts older settings and preserves explicit false on the next resynchronization", async () => {
    await runtime.initRuntimeSettings();
    const older = olderSettings();
    stored = JSON.stringify(older);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, structureOwnerProposalsEnabled: true });
    stored = JSON.stringify({ ...older, structureOwnerProposalsEnabled: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, structureOwnerProposalsEnabled: false });
  });
});
