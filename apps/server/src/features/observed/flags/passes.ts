import { logger } from "../../../utils/logger.js";
import { resolveBandFlags, syncBandFlags } from "./bands.js";
import { syncDecommissionedFlags } from "./cells/decommissioned.js";
import { syncContributorFlags } from "./contributors.js";
import { syncDeviceFlags } from "./devices.js";
import { syncGnbLengthFlags } from "./gnbLength.js";
import { syncReaderQuirkFlags } from "./readerQuirks.js";
import type { FlagSyncCounts } from "./sync.js";

type FlagPass = readonly [kind: string, pass: () => Promise<FlagSyncCounts>];

async function runPasses(passes: readonly FlagPass[]): Promise<void> {
  for (const [kind, pass] of passes) {
    const startedAt = Date.now();
    // oxlint-disable-next-line no-await-in-loop
    await pass().then(
      (counts) => logger.info("observations.flags.pass_finished", { kind, ms: Date.now() - startedAt, counts }),
      (error: unknown) => logger.error("observations.flags.pass", { kind, error }),
    );
  }
}

const HOURLY_PASSES = [
  ["bandNotInPlan", resolveBandFlags],
  ["deviceRevoked", syncDeviceFlags],
  ["untrustedContributor", syncContributorFlags],
  ["readerQuirk", syncReaderQuirkFlags],
] as const;

export async function runHourlyFlagPasses(): Promise<void> {
  await runPasses(HOURLY_PASSES);
}

const DAILY_PASSES = [
  ["bandNotInPlan", syncBandFlags],
  ["possiblyDecommissioned", syncDecommissionedFlags],
  ["gnbLengthSuggestion", syncGnbLengthFlags],
] as const;

export async function runDailyFlagPasses(): Promise<void> {
  await runPasses(DAILY_PASSES);
}
