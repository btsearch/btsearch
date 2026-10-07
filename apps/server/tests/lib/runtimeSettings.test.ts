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
  return settings;
}

describe("getDefaultRuntimeSettings", () => {
  it("does not include the country-scoped feature flags", () => {
    const settings = runtime.getDefaultRuntimeSettings();
    for (const flag of ["structureOwnerProposalsEnabled", "pscEnabled", "bsicEnabled"]) expect(settings).not.toHaveProperty(flag);
  });
});

describe("mergeRuntimeSettings", () => {
  it("toggles maintenance mode while retaining all other settings", () => {
    const before = { ...runtime.getDefaultRuntimeSettings(), submissionsEnabled: false };
    const enabled = runtime.mergeRuntimeSettings(before, { maintenanceEnabled: true });
    expect(enabled).toEqual({ ...before, maintenanceEnabled: true });
    expect(runtime.mergeRuntimeSettings(enabled, { photosEnabled: false })).toEqual({ ...enabled, photosEnabled: false });
    expect(runtime.mergeRuntimeSettings(enabled, { maintenanceEnabled: false })).toEqual(before);
  });
  it("preserves an explicit false and unrelated settings in a partial feature update", () => {
    const before = { ...runtime.getDefaultRuntimeSettings(), photosEnabled: true };
    const disabled = runtime.mergeRuntimeSettings(before, { photosEnabled: false });
    expect(disabled).toEqual({ ...before, photosEnabled: false });
    expect(runtime.mergeRuntimeSettings(disabled, { submissionsEnabled: false })).toEqual({
      ...disabled,
      submissionsEnabled: false,
    });
  });
});

describe("initRuntimeSettings", () => {
  it("defaults maintenance mode to false for older stored settings without resetting other fields", async () => {
    const older = olderSettings();
    delete older.maintenanceEnabled;
    stored = JSON.stringify(older);
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, maintenanceEnabled: false });
    expect(redisBoundary.set).not.toHaveBeenCalled();
  });
  it("loads stored global settings without adding removed country flags", async () => {
    const older = olderSettings();
    stored = JSON.stringify(older);
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual(older);
  });

  it("keeps a stored explicit false after initialization", async () => {
    const settings = { ...runtime.getDefaultRuntimeSettings(), submissionsEnabled: false };
    stored = JSON.stringify(settings);
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual(settings);
  });

  it.each([null, "false"])("does not repair an explicitly invalid startup setting %s into a persisted boolean", async (invalid) => {
    stored = JSON.stringify({ ...runtime.getDefaultRuntimeSettings(), photosEnabled: invalid });
    const invalidStored = stored;
    await runtime.initRuntimeSettings();
    expect(runtime.getRuntimeSettings()).toEqual(runtime.getDefaultRuntimeSettings());
    expect(redisBoundary.set).not.toHaveBeenCalled();
    expect(stored).toBe(invalidStored);
  });
});

describe("saveRuntimeSettings", () => {
  it("stores and publishes an explicit false together with the other settings", async () => {
    const settings = { ...runtime.getDefaultRuntimeSettings(), photosEnabled: false };
    await runtime.saveRuntimeSettings(settings);
    expect(savedBatch.set).toHaveBeenCalledWith("runtime:settings", JSON.stringify(settings));
    expect(savedBatch.publish).toHaveBeenCalledWith("runtime:settings:updates", JSON.stringify(settings));
    expect(savedBatch.exec).toHaveBeenCalledOnce();
    expect(runtime.getRuntimeSettings()).toEqual(settings);
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(settings);
  });
});

describe("loadStoredRuntimeSettings", () => {
  it.each([null, "true", 1])("rejects the invalid stored maintenance flag %s without resetting current settings", async (invalid) => {
    const current = runtime.getRuntimeSettings();
    current.maintenanceEnabled = true;
    stored = JSON.stringify({ ...current, maintenanceEnabled: invalid });
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(current);
  });
  it("reads global settings without restoring removed feature defaults", async () => {
    const older = olderSettings();
    stored = JSON.stringify(older);
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(older);
  });

  it.each([null, "false", 0])("rejects an invalid stored global setting %s without replacing current settings", async (invalid) => {
    const current = runtime.getRuntimeSettings();
    current.photosEnabled = false;
    stored = JSON.stringify({ ...runtime.getDefaultRuntimeSettings(), photosEnabled: invalid });
    expect(await runtime.loadStoredRuntimeSettings()).toEqual(current);
    expect(runtime.getRuntimeSettings()).toEqual(current);
  });
});

describe("runtime settings subscription", () => {
  it("defaults a missing maintenance flag from an older settings writer without resetting other fields", async () => {
    await runtime.initRuntimeSettings();
    const older = olderSettings();
    delete older.maintenanceEnabled;
    subscriber!(JSON.stringify(older));
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, maintenanceEnabled: false });
  });
  it("applies maintenance mode updates from another server replica", async () => {
    await runtime.initRuntimeSettings();
    const enabled = { ...runtime.getRuntimeSettings(), maintenanceEnabled: true };
    subscriber!(JSON.stringify(enabled));
    expect(runtime.getRuntimeSettings()).toEqual(enabled);
    subscriber!(JSON.stringify({ ...enabled, maintenanceEnabled: false }));
    expect(runtime.getRuntimeSettings()).toEqual({ ...enabled, maintenanceEnabled: false });
  });
  it("accepts an older published settings object without resetting its other fields", async () => {
    await runtime.initRuntimeSettings();
    const older = olderSettings();
    subscriber!(JSON.stringify(older));
    expect(runtime.getRuntimeSettings()).toEqual(older);
  });

  it("applies an explicit false from another settings writer", async () => {
    await runtime.initRuntimeSettings();
    const next = { ...runtime.getRuntimeSettings(), photosEnabled: false };
    subscriber!(JSON.stringify(next));
    expect(runtime.getRuntimeSettings()).toEqual(next);
  });

  it.each([null, "false"])("ignores an invalid published global setting %s", async (invalid) => {
    await runtime.initRuntimeSettings();
    const before = structuredClone(runtime.getRuntimeSettings());
    subscriber!(JSON.stringify({ ...before, submissionsEnabled: invalid, photosEnabled: false }));
    expect(runtime.getRuntimeSettings()).toEqual(before);
  });
});

describe("runtime settings resynchronization", () => {
  it("accepts older settings and applies a later global update", async () => {
    await runtime.initRuntimeSettings();
    const older = olderSettings();
    stored = JSON.stringify(older);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.getRuntimeSettings()).toEqual(older);
    stored = JSON.stringify({ ...older, photosEnabled: true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.getRuntimeSettings()).toEqual({ ...older, photosEnabled: true });
  });
});
