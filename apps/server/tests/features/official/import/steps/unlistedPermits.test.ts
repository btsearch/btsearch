import { beforeEach, describe, expect, it } from "vitest";

import { unlistedPermits } from "../../../../../src/features/official/import/steps/unlistedPermits.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  RUN_ID,
  ownRun,
  recordTransactions,
  runStep,
  scriptStepFinish,
  scriptStepStart,
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

function unlisted(firstPermitId: number, count: number): { permitId: number; officialSiteId: number }[] {
  return Array.from({ length: count }, (_, index) => ({ permitId: firstPermitId + index, officialSiteId: 500 }));
}

function unlistedReads() {
  return dbMock.calls.filter((call) => call.operation === "select" && call.table === "official.permits");
}

function scriptArchivedPage(permits: readonly { permitId: number; officialSiteId: number }[]): void {
  ownRun(1);
  dbMock.enqueueFor("select", "official.permits", [...permits]);
  dbMock.enqueueFor("insert", "official.import_changes", undefined);
  dbMock.enqueueFor("delete", "official.permits", undefined);
}

beforeEach(recordTransactions);

describe("the unlisted permits step", () => {
  it("archives a thousand permits per transaction, and reads each next page after the last permit it archived", async () => {
    scriptStepStart();
    scriptArchivedPage(unlisted(1, 1000));
    scriptArchivedPage(unlisted(2001, 3));
    scriptStepFinish();

    await runStep(unlistedPermits);

    expect(dbMock.pendingResults()).toBe(0);
    const reads = unlistedReads();
    expect(reads.map((read) => [...whereOf(read).params, ...(read.clauses.limit ?? [])])).toEqual([
      [1, 0, 1000],
      [1, 1000, 1000],
    ]);
  });

  it("records each archived permit with its site, then deletes it", async () => {
    scriptStepStart();
    scriptArchivedPage([
      { permitId: 7, officialSiteId: 500 },
      { permitId: 8, officialSiteId: 501 },
    ]);
    scriptStepFinish();

    await runStep(unlistedPermits);

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("insert", "official.import_changes")).toEqual([
      [
        { runId: RUN_ID, kind: "permit_archived", officialSiteId: 500, permitId: 7 },
        { runId: RUN_ID, kind: "permit_archived", officialSiteId: 501, permitId: 8 },
      ],
    ]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete" && call.table === "official.permits")).params).toEqual([7, 8]);
  });

  it("stops after one read when nothing is unlisted", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.permits", []);
    scriptStepFinish();

    await runStep(unlistedPermits);

    expect(dbMock.pendingResults()).toBe(0);
    expect(unlistedReads()).toHaveLength(1);
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });
});
