import { beforeEach, describe, expect, it } from "vitest";

import { orphans } from "../../../../../src/features/official/import/steps/orphans.js";
import { logger } from "../../../../../src/utils/logger.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  RUN_ID,
  change,
  claimedRun,
  lostDeadlock,
  ownRun,
  recordTransactions,
  runStep,
  scriptStepFinish,
  scriptStepStart,
  statementOf,
  trace,
  transactionsOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

type Deleted = { id: number }[];

function deleteFrom(table: string) {
  return whereOf(dbMock.calls.find((call) => call.operation === "delete" && call.table === table));
}

function scriptDeletes(sites: Deleted | Error, locations?: Deleted, licensees?: Deleted): void {
  dbMock.enqueueFor("delete", "official.sites", sites);
  if (locations) dbMock.enqueueFor("delete", "official.locations", locations);
  if (licensees) dbMock.enqueueFor("delete", "official.licensees", licensees);
}

beforeEach(recordTransactions);

describe("the orphans step", () => {
  it("deletes sites, locations and unmapped licensees, and takes deleted sites and archived links out of lists in one transaction", async () => {
    scriptStepStart();
    ownRun(1);
    scriptDeletes([{ id: 502 }, { id: 507 }], [{ id: 12 }], [{ id: 31 }, { id: 32 }, { id: 33 }]);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(40, "microwave_link_archived", { datasetId: 3, slice: "", microwaveLinkId: 804 }),
      change(41, "microwave_link_archived", { datasetId: 3, slice: "", microwaveLinkId: 805 }),
    ]);
    dbMock.enqueueFor("execute", undefined, [], []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(orphans, { run: claimedRun({ sourceId: 7 }) });

    expect(dbMock.pendingResults()).toBe(0);
    const [, work] = transactionsOf(trace());
    expect(work).toEqual([
      "select official.import_runs",
      "delete official.sites",
      "delete official.locations",
      "delete official.licensees",
      "select official.import_changes",
      "execute",
      "execute",
      "update official.import_run_steps",
      "commit",
    ]);
    expect(deleteFrom("official.sites").params).toEqual([7]);
    expect(deleteFrom("official.locations").params).toEqual([7]);
    expect(deleteFrom("official.licensees").params).toEqual([7]);
    const [sitesOutOfLists, linksOutOfLists] = dbMock.calls.filter((call) => call.operation === "execute").map(statementOf);
    expect(sitesOutOfLists?.params).toEqual(["[502,507]"]);
    expect(linksOutOfLists?.params).toEqual(["[804,805]"]);

    expect(whereOf(dbMock.calls.find((call) => call.table === "official.import_changes")).params).toEqual([RUN_ID, "microwave_link_archived"]);
    expect(logger.info).toHaveBeenCalledWith("official.import.orphans", {
      runId: RUN_ID,
      sites: 2,
      locations: 1,
      licensees: 3,
      microwaveLinks: 2,
    });
  });

  it("does not touch the lists when nothing was deleted or archived", async () => {
    scriptStepStart();
    ownRun(1);
    scriptDeletes([], [], []);
    dbMock.enqueueFor("select", "official.import_changes", []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(orphans);

    expect(dbMock.pendingResults()).toBe(0);
    expect(trace()).not.toContain("execute");
  });

  it("starts over when its transaction lost a deadlock, so nothing is deleted twice or left half done", async () => {
    scriptStepStart();
    ownRun(2);
    scriptDeletes(lostDeadlock());
    scriptDeletes([{ id: 502 }], [], []);
    dbMock.enqueueFor("select", "official.import_changes", []);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(orphans);

    expect(dbMock.pendingResults()).toBe(0);
    const [, lost, repeated] = transactionsOf(trace());
    expect(lost).toEqual(["select official.import_runs", "delete official.sites", "rollback"]);
    expect(repeated).toEqual([
      "select official.import_runs",
      "delete official.sites",
      "delete official.locations",
      "delete official.licensees",
      "select official.import_changes",
      "execute",
      "update official.import_run_steps",
      "commit",
    ]);
  });
});
