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

const LABELS = [
  [/SET stations = jsonb_set/, "remove sites from lists"],
  [/SET radiolines = kept\.ids/, "remove links from lists"],
] as const;

type Deleted = { id: number }[];

function executed(label: string) {
  return statementOf(dbMock.calls.find((call) => call.operation === "execute" && trace(LABELS)[dbMock.calls.indexOf(call)] === label));
}

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
    const [, work] = transactionsOf(trace(LABELS));
    expect(work).toEqual([
      "select official.import_runs",
      "delete official.sites",
      "delete official.locations",
      "delete official.licensees",
      "select official.import_changes",
      "remove sites from lists",
      "remove links from lists",
      "update official.import_run_steps",
      "commit",
    ]);
    expect(deleteFrom("official.sites").params).toEqual([7]);
    expect(deleteFrom("official.locations").params).toEqual([7]);
    expect(deleteFrom("official.licensees").params).toEqual([7]);
    expect(executed("remove sites from lists").params).toEqual(["[502,507]"]);
    expect(executed("remove links from lists").params).toEqual(["[804,805]"]);

    expect(whereOf(dbMock.calls.find((call) => call.table === "official.import_changes")).params).toEqual([RUN_ID, "microwave_link_archived"]);
    expect(logger.info).toHaveBeenCalledWith("official.import.orphans", {
      runId: RUN_ID,
      sites: 2,
      locations: 1,
      licensees: 3,
      microwaveLinks: 2,
    });
  });

  it("scopes every delete to the run's source and to rows nothing references, a licensee only when it has no operator", async () => {
    scriptStepStart();
    ownRun(1);
    scriptDeletes([], [], []);
    dbMock.enqueueFor("select", "official.import_changes", []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(orphans, { run: claimedRun({ sourceId: 7 }) });

    expect(deleteFrom("official.sites")).toEqual({
      sql: '(("official"."sites"."source_id" = $1) and (not exists select "official"."permits"."id" from "official"."permits" where "official"."permits"."official_site_id" = "official"."sites"."id"))',
      params: [7],
    });
    expect(deleteFrom("official.locations")).toEqual({
      sql: '(("official"."locations"."source_id" = $1) and (not exists select "official"."sites"."id" from "official"."sites" where "official"."sites"."location_id" = "official"."locations"."id"))',
      params: [7],
    });
    expect(deleteFrom("official.licensees")).toEqual({
      sql:
        '(("official"."licensees"."source_id" = $1) and (("official"."licensees"."operator_id" is null)) ' +
        'and (not exists select "official"."microwave_links"."id" from "official"."microwave_links" where "official"."microwave_links"."licensee_id" = "official"."licensees"."id") ' +
        'and (not exists select "official"."permit_listings"."permit_id" from "official"."permit_listings" where "official"."permit_listings"."licensee_id" = "official"."licensees"."id") ' +
        'and (not exists select "official"."remap_runs"."run_id" from "official"."remap_runs" where "official"."remap_runs"."licensee_id" = "official"."licensees"."id"))',
      params: [7],
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
    expect(trace(LABELS).filter((operation) => operation.endsWith("from lists"))).toEqual([]);
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
    const [, lost, repeated] = transactionsOf(trace(LABELS));
    expect(lost).toEqual(["select official.import_runs", "delete official.sites", "rollback"]);
    expect(repeated).toEqual([
      "select official.import_runs",
      "delete official.sites",
      "delete official.locations",
      "delete official.licensees",
      "select official.import_changes",
      "remove sites from lists",
      "update official.import_run_steps",
      "commit",
    ]);
  });
});
