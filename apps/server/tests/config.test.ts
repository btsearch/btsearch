import { describe, expect, it, vi } from "vitest";

describe("the switch that schedules official imports", () => {
  it.each<[string | undefined, boolean]>([
    [undefined, true],
    ["true", true],
    ["", true],
    ["no", true],
    ["false", false],
    [" FALSE ", false],
  ])("OFFICIAL_AUTO_IMPORT=%j schedules: %s", async (value, expected) => {
    vi.stubEnv("OFFICIAL_AUTO_IMPORT", value);
    vi.resetModules();

    const { officialAutoImportEnabled } = await import("../src/config.js");

    expect(officialAutoImportEnabled).toBe(expected);
  });
});
