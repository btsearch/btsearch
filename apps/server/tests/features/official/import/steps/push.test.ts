import { beforeEach, describe, expect, it } from "vitest";

import { push } from "../../../../../src/features/official/import/steps/push.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptDatasetOutcomes,
  scriptStepFinish,
  scriptStepStart,
  sourceOf,
  trace,
  valuesOf,
} from "../../../../helpers/importEngineFixtures.js";

const APPLIED_LINKS = [{ datasetId: 3, slice: "", outcome: "applied" as const }];

function scriptRecorded(runSlices: Parameters<typeof scriptDatasetOutcomes>[1] | null): void {
  scriptStepStart();
  ownRun(1);
  if (runSlices) scriptDatasetOutcomes([{ datasetId: 3, error: null }], runSlices);
  dbMock.enqueueFor("update", "official.import_run_steps", undefined);
}

beforeEach(recordTransactions);

describe("the push step", () => {
  it("records itself as finished and commits before it reads the subscriptions and sends", async () => {
    scriptRecorded(APPLIED_LINKS);
    dbMock.enqueueFor("select", "push_subscriptions", []);
    scriptStepFinish();

    await runStep(push);

    expect(dbMock.pendingResults()).toBe(0);
    const operations = trace();
    const recorded = operations.indexOf("update official.import_run_steps");
    expect(operations.slice(recorded, recorded + 3)).toEqual(["update official.import_run_steps", "commit", "select push_subscriptions"]);
    expect(Object.keys(valuesOf("update", "official.import_run_steps")[0] ?? {})).toEqual(["finishedAt"]);
  });

  it("is sent for a replay that applied a slice, as for an import", async () => {
    scriptRecorded(APPLIED_LINKS);
    dbMock.enqueueFor("select", "push_subscriptions", []);
    scriptStepFinish();

    await runStep(push, { run: claimedRun({ kind: "replay" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.filter((call) => call.table === "push_subscriptions")).toHaveLength(1);
  });

  it.each([
    { case: "the run applied nothing", runSlices: [{ datasetId: 3, slice: "", outcome: "unchanged" as const }] },
    { case: "the run only held a slice", runSlices: [{ datasetId: 3, slice: "", outcome: "held" as const }] },
  ])("sends nothing when $case", async ({ runSlices }) => {
    scriptRecorded(runSlices);
    scriptStepFinish();

    await runStep(push);

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "push_subscriptions")).toBe(false);
  });

  it.each([
    { case: "the source of another country", run: claimedRun(), countryCode: "FR" },
    { case: "a remap run", run: claimedRun({ kind: "remap" }), countryCode: "PL" },
    { case: "a relink run", run: claimedRun({ kind: "relink" }), countryCode: "PL" },
  ])("sends nothing for $case, without reading its datasets", async ({ run, countryCode }) => {
    scriptRecorded(null);
    scriptStepFinish();

    await runStep(push, { run, source: sourceOf({ countryCode }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "push_subscriptions" || call.table === "official.datasets")).toBe(false);
  });

  it("keeps the run going when the send fails, with the error on the step", async () => {
    scriptRecorded(APPLIED_LINKS);
    dbMock.enqueueFor("select", "push_subscriptions", new Error("connection lost"));
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await expect(runStep(push)).resolves.toBeUndefined();

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("update", "official.import_run_steps")[1]).toEqual({ error: "connection lost" });
  });
});
