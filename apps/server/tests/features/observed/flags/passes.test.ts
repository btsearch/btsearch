import { describe, expect, it, vi } from "vitest";

import { runHourlyFlagPasses } from "../../../../src/features/observed/flags/passes.js";
import { logger } from "../../../../src/utils/logger.js";

const passes = vi.hoisted(() => ({
  resolveBandFlags: vi.fn(),
  syncDeviceFlags: vi.fn(),
  syncContributorFlags: vi.fn(),
  syncReaderQuirkFlags: vi.fn(),
}));
vi.mock("../../../../src/features/observed/flags/bands.js", () => ({ resolveBandFlags: passes.resolveBandFlags, syncBandFlags: vi.fn() }));
vi.mock("../../../../src/features/observed/flags/devices.js", () => ({ syncDeviceFlags: passes.syncDeviceFlags }));
vi.mock("../../../../src/features/observed/flags/contributors.js", () => ({ syncContributorFlags: passes.syncContributorFlags }));
vi.mock("../../../../src/features/observed/flags/readerQuirks.js", () => ({ syncReaderQuirkFlags: passes.syncReaderQuirkFlags }));

describe("the hourly flag passes", () => {
  it("log what each pass opened, updated and resolved, and run the others when one fails", async () => {
    const counts = { opened: 2, updated: 1, resolved: 3 };
    passes.resolveBandFlags.mockResolvedValue(counts);
    passes.syncDeviceFlags.mockRejectedValue(new Error("revocation list unreadable"));
    passes.syncContributorFlags.mockResolvedValue(counts);
    passes.syncReaderQuirkFlags.mockResolvedValue(counts);

    await runHourlyFlagPasses();

    expect(vi.mocked(logger.info).mock.calls).toEqual([
      ["observations.flags.pass_finished", { kind: "bandNotInPlan", ms: expect.any(Number), counts }],
      ["observations.flags.pass_finished", { kind: "untrustedContributor", ms: expect.any(Number), counts }],
      ["observations.flags.pass_finished", { kind: "readerQuirk", ms: expect.any(Number), counts }],
    ]);
    expect(logger.error).toHaveBeenCalledWith("observations.flags.pass", { kind: "deviceRevoked", error: expect.any(Error) });
  });
});
