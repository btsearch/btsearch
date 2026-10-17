import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DryRunReport } from "../../../../src/features/official/import/report.js";
import type { DryRunEnd, RunEnd } from "../../../../src/features/official/import/run.js";
import { IDLE_WAIT_MS, type RunnerEngine, startImportRunner } from "../../../../src/features/official/import/runner.js";
import { RunNotOwnedError } from "../../../../src/features/official/import/runs.js";
import type { ClaimedRun } from "../../../../src/features/official/import/types.js";
import { logger } from "../../../../src/utils/logger.js";
import { claimedRun } from "../../../helpers/importEngineFixtures.js";

type Claim = ClaimedRun | null | Error | Promise<ClaimedRun | null>;

const REPORT: DryRunReport = {
  slices: [],
  failedDatasets: [],
  afterStepChanges: {},
  siteNames: { written: 0, skipped: 0 },
  licenseeNamesCorrected: 0,
  remap: null,
};

let events: string[];

function scriptedEngine(claims: Claim[], overrides: Partial<RunnerEngine> = {}): RunnerEngine {
  return {
    async claimNextRun() {
      events.push("claim");
      const next = claims.shift() ?? null;
      if (next instanceof Error) throw next;
      return next;
    },
    async processRun(run) {
      events.push(`process ${run.id}`);
      return "done";
    },
    async processDryRun(run) {
      events.push(`rehearse ${run.id}`);
      return { end: "done", report: REPORT };
    },
    async releaseRun(run) {
      events.push(`hand back ${run.id}`);
    },
    ...overrides,
  };
}

function processingUntil(end: Promise<RunEnd>): RunnerEngine["processRun"] {
  return (run) => {
    events.push(`process ${run.id}`);
    return end;
  };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  events = [];
});

describe("the runner's loop", () => {
  it("processes one run at a time and claims the next as soon as one ends", async () => {
    const first = Promise.withResolvers<RunEnd>();
    const second = Promise.withResolvers<RunEnd>();
    const ends = [first.promise, second.promise];
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a" }), claimedRun({ id: "b" })], {
        processRun(run) {
          events.push(`process ${run.id}`);
          return ends.shift() ?? Promise.resolve("done");
        },
      }),
    );
    await settle();
    expect(events).toEqual(["claim", "process a"]);

    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS * 3);
    expect(events).toEqual(["claim", "process a"]);

    first.resolve("done");
    await settle();
    expect(events).toEqual(["claim", "process a", "claim", "process b"]);

    second.resolve("failed");
    await settle();
    expect(events).toEqual(["claim", "process a", "claim", "process b", "claim"]);

    await runner.stop();
  });

  it("waits five seconds before it asks again when no run waits", async () => {
    const runner = startImportRunner(scriptedEngine([null, null, claimedRun({ id: "a" })]));
    await settle();
    expect(events).toEqual(["claim"]);

    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS - 1);
    expect(events).toEqual(["claim"]);

    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(["claim", "claim"]);

    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS);
    expect(events).toEqual(["claim", "claim", "claim", "process a", "claim"]);
    expect(IDLE_WAIT_MS).toBe(5_000);

    await runner.stop();
  });

  it.each<[string, DryRunEnd]>([
    ["that ended", { end: "done", report: REPORT }],
    ["that failed", { end: "failed", error: "The page is gone" }],
    ["that was cancelled", { end: "lost" }],
  ])("rehearses a dry run %s, logs how it ended and claims the next", async (_case, dryRunEnd) => {
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a", isDryRun: true })], {
        async processDryRun(run) {
          events.push(`rehearse ${run.id}`);
          return dryRunEnd;
        },
      }),
    );
    await settle();

    expect(events).toEqual(["claim", "rehearse a", "claim"]);
    expect(logger.info).toHaveBeenLastCalledWith("official.importer.ended", {
      runId: "a",
      source: "pl-uke",
      kind: "import",
      isDryRun: true,
      attempt: 1,
      end: dryRunEnd.end,
    });
    await runner.stop();
  });

  it.each<[string, Claim[], Partial<RunnerEngine>]>([
    ["the claim", [new Error("The database is away"), claimedRun({ id: "a" })], {}],
    [
      "a run",
      [claimedRun({ id: "broken" }), claimedRun({ id: "a" })],
      {
        async processRun(run) {
          if (run.id === "broken") throw new Error("The database is away");
          events.push(`process ${run.id}`);
          return "done";
        },
      },
    ],
    [
      "a dry run",
      [claimedRun({ id: "broken", isDryRun: true }), claimedRun({ id: "a" })],
      {
        async processDryRun() {
          throw new Error("The database is away");
        },
      },
    ],
  ])("logs a failure of %s, waits and goes on", async (_case, claims, overrides) => {
    const runner = startImportRunner(scriptedEngine(claims, overrides));
    await settle();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(events).not.toContain("process a");

    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS - 1);
    expect(events).not.toContain("process a");

    await vi.advanceTimersByTimeAsync(1);
    expect(events).toContain("process a");
    expect(logger.error).toHaveBeenCalledTimes(1);

    await runner.stop();
  });
});

describe("stopping the runner", () => {
  it("hands the run in flight back, lets its processing end and claims nothing more", async () => {
    const processing = Promise.withResolvers<RunEnd>();
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a" }), claimedRun({ id: "b" })], { processRun: processingUntil(processing.promise) }),
    );
    await settle();

    let hasStopped = false;
    const stopped = runner.stop().then(() => {
      hasStopped = true;
    });
    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS * 3);
    expect(events).toEqual(["claim", "process a", "hand back a"]);
    expect(hasStopped).toBe(false);

    processing.resolve("lost");
    await stopped;
    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS * 3);
    expect(events).toEqual(["claim", "process a", "hand back a"]);
  });

  it("is not done before the hand-back is, which waits for the transaction in flight", async () => {
    const handBack = Promise.withResolvers<void>();
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a" })], {
        processRun: processingUntil(handBack.promise.then((): RunEnd => "lost")),
        releaseRun(run) {
          events.push(`hand back ${run.id}`);
          return handBack.promise;
        },
      }),
    );
    await settle();

    let hasStopped = false;
    const stopped = runner.stop().then(() => {
      hasStopped = true;
    });
    await vi.advanceTimersByTimeAsync(IDLE_WAIT_MS * 10);
    expect(events).toEqual(["claim", "process a", "hand back a"]);
    expect(hasStopped).toBe(false);

    handBack.resolve();
    await stopped;
    expect(hasStopped).toBe(true);
  });

  it("ends an idle wait at once and hands nothing back", async () => {
    const runner = startImportRunner(scriptedEngine([]));
    await settle();

    await runner.stop();

    expect(events).toEqual(["claim"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hands a run back unprocessed when the stop came while it was being claimed", async () => {
    const claiming = Promise.withResolvers<ClaimedRun | null>();
    const runner = startImportRunner(scriptedEngine([claiming.promise]));
    await settle();

    const stopped = runner.stop();
    claiming.resolve(claimedRun({ id: "a" }));
    await stopped;

    expect(events).toEqual(["claim", "hand back a"]);
  });

  it.each<[string, Error, number]>([
    ["says nothing when the run ended or was taken over meanwhile", new RunNotOwnedError("a"), 0],
    ["logs a hand-back that failed", new Error("The database is away"), 1],
  ])("%s", async (_case, failure, loggedErrors) => {
    const processing = Promise.withResolvers<RunEnd>();
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a" })], {
        processRun: processingUntil(processing.promise),
        async releaseRun() {
          throw failure;
        },
      }),
    );
    await settle();

    const stopped = runner.stop();
    await settle();
    processing.resolve("done");
    await stopped;

    expect(logger.error).toHaveBeenCalledTimes(loggedErrors);
  });

  it("does the hand-back once when asked to stop twice", async () => {
    const processing = Promise.withResolvers<RunEnd>();
    const runner = startImportRunner(scriptedEngine([claimedRun({ id: "a" })], { processRun: processingUntil(processing.promise) }));
    await settle();

    const stopped = Promise.all([runner.stop(), runner.stop()]);
    await settle();
    processing.resolve("lost");
    await stopped;

    expect(events).toEqual(["claim", "process a", "hand back a"]);
  });

  it("aborts the work of the run in flight once it is handed back, so the run ends at once as lost and nothing logs an error", async () => {
    let handedBack: AbortSignal | undefined;
    const runner = startImportRunner(
      scriptedEngine([claimedRun({ id: "a" }), claimedRun({ id: "b" })], {
        processRun(run, signal) {
          events.push(`process ${run.id}`);
          handedBack = signal;
          return new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              events.push(`abort ${run.id}`);
              resolve("lost");
            });
          });
        },
      }),
    );
    await settle();
    expect(handedBack?.aborted).toBe(false);

    await runner.stop();

    expect(events).toEqual(["claim", "process a", "hand back a", "abort a"]);
    expect(handedBack?.reason).toBeInstanceOf(RunNotOwnedError);
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenLastCalledWith("official.importer.ended", expect.objectContaining({ runId: "a", end: "lost" }));
  });
});
