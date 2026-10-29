import type { SQLWrapper } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";

import { directoryArchive } from "../../../../src/features/official/import/archive.js";
import { REPORTED_IDS_LIMIT } from "../../../../src/features/official/import/config.js";
import { remapLicensee } from "../../../../src/features/official/import/remap/apply.js";
import { type RemapInput, type RemapPlan, planRemap } from "../../../../src/features/official/import/remap/plan.js";
import { processDryRun, processRun } from "../../../../src/features/official/import/run.js";
import type { ClaimedRun } from "../../../../src/features/official/import/types.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { RUN_ID, claimedRun, ownRun, recordTransactions, sourceOf, trace } from "../../../helpers/importEngineFixtures.js";

const dialect = new PgDialect();
const STARTED_AT = claimedRun().startedAt;
const LICENSEE = 8;
const OTHER_LICENSEE = 9;
const FROM_OPERATOR = 4;
const TO_OPERATOR = 5;

const tx = dbMock as unknown as DbTx;
const environment = {
  sources: [sourceOf()],
  database: tx,
  archive: directoryArchive("unused"),
  steps: [],
  keepDryRunReport: async () => undefined,
};

function site(id: number, overrides: Partial<RemapInput["sites"][number]> = {}): RemapInput["sites"][number] {
  return { id, siteCode: "BT1001", sourceRef: null, operatorId: FROM_OPERATOR, ...overrides };
}

function permit(id: number, officialSiteId: number, valuesKey = `permit ${id}`): RemapInput["permits"][number] {
  return { id, officialSiteId, valuesKey };
}

function listing(permitId: number, licenseeId: number | null = LICENSEE, datasetId = 1): RemapInput["listings"][number] {
  return { permitId, datasetId, licenseeId };
}

function inputWith(overrides: Partial<RemapInput>): RemapInput {
  return {
    licenseeId: LICENSEE,
    toOperatorId: TO_OPERATOR,
    operatorByLicensee: new Map([
      [LICENSEE, FROM_OPERATOR],
      [OTHER_LICENSEE, FROM_OPERATOR],
    ]),
    sites: [],
    targets: [],
    permits: [],
    listings: [],
    ...overrides,
  };
}

function planWith(overrides: Partial<Omit<RemapPlan, "counts">> & { counts?: Partial<RemapPlan["counts"]> }): RemapPlan {
  return {
    rekeyedSiteIds: [],
    splits: [],
    moves: [],
    merges: [],
    emptiedSites: [],
    unlistings: [],
    remappedSiteIds: [],
    touchedSiteIds: [],
    ...overrides,
    counts: {
      sitesRekeyed: 0,
      sitesMerged: 0,
      sitesSplit: 0,
      permitsMoved: 0,
      permitsMerged: 0,
      permitsBlocked: { count: 0, ids: [] },
      listingsRemoved: 0,
      ...overrides.counts,
    },
  };
}

function remapRun(overrides: Partial<ClaimedRun> = {}): ClaimedRun {
  return claimedRun({ kind: "remap", ...overrides });
}

function paramsOf(statement: unknown): unknown[] {
  const { params } = dialect.sqlToQuery((statement as SQLWrapper).getSQL());
  return params.map((parameter) => (typeof parameter === "string" && /^[[{]/.test(parameter) ? JSON.parse(parameter) : parameter));
}

function executedParams(): unknown[][] {
  return dbMock.calls.filter((call) => call.operation === "execute").map((call) => paramsOf(call.clauses.statement?.[0]));
}

function sitesWritten(operation: "insert" | "update") {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === "official.sites");
}

function scriptRemap(remap: { fromOperatorId: number | null; toOperatorId: number | null }, storedOperatorId: number | null): void {
  dbMock.enqueueFor("select", "official.remap_runs", [{ licenseeId: LICENSEE, ...remap }]);
  dbMock.enqueueFor("select", "official.licensees", [{ sourceId: 1, operatorId: storedOperatorId }]);
}

function scriptMapping(): void {
  dbMock.enqueueFor("select", "official.licensees", [
    { id: LICENSEE, operatorId: FROM_OPERATOR },
    { id: OTHER_LICENSEE, operatorId: FROM_OPERATOR },
  ]);
}

function scriptReads(reads: Pick<RemapInput, "sites" | "permits" | "listings"> & Partial<Pick<RemapInput, "targets">>): void {
  dbMock.enqueueFor("select", "official.sites", reads.sites);
  if (reads.targets) dbMock.enqueueFor("select", "official.target", reads.targets);
  dbMock.enqueueFor("select", "official.permits", reads.permits);
  dbMock.enqueueFor("select", "official.permit_listings", reads.listings);
}

function scriptThreeSites(): void {
  scriptReads({
    sites: [site(501), site(502, { siteCode: "BT1002" }), site(503, { siteCode: "BT1003" })],
    targets: [site(602, { siteCode: "BT1002", operatorId: TO_OPERATOR })],
    permits: [permit(701, 501), permit(702, 502, "same"), permit(703, 502), permit(704, 503), permit(705, 503), permit(802, 602, "same")],
    listings: [listing(701), listing(702), listing(703), listing(704), listing(705), listing(705, OTHER_LICENSEE, 2)],
  });
}

beforeEach(recordTransactions);

describe("the plan of a remap", () => {
  it("re-keys a site in place when every permit moves and the new operator has no site there", () => {
    const plan = planRemap(inputWith({ sites: [site(501)], permits: [permit(701, 501), permit(702, 501)], listings: [listing(701), listing(702)] }));

    expect(plan).toEqual(
      planWith({ rekeyedSiteIds: [501], remappedSiteIds: [501], touchedSiteIds: [501], counts: { sitesRekeyed: 1, permitsMoved: 2 } }),
    );
  });

  it("merges onto the new operator's site: an equal permit is merged, the others move, and the emptied site goes", () => {
    const plan = planRemap(
      inputWith({
        sites: [site(501)],
        targets: [site(601, { operatorId: TO_OPERATOR })],
        permits: [permit(701, 501, "same"), permit(702, 501), permit(801, 601, "same"), permit(802, 601)],
        listings: [listing(701), listing(702)],
      }),
    );

    expect(plan).toEqual(
      planWith({
        moves: [{ permitId: 702, fromSiteId: 501, toSiteId: 601 }],
        merges: [{ permitId: 701, fromSiteId: 501, intoPermitId: 801 }],
        emptiedSites: [{ siteId: 501, intoSiteId: 601 }],
        remappedSiteIds: [601],
        touchedSiteIds: [601],
        counts: { sitesMerged: 1, permitsMoved: 2, permitsMerged: 1 },
      }),
    );
  });

  it("splits a site when only some permits move: the new operator's site is created for them", () => {
    const plan = planRemap(
      inputWith({
        sites: [site(501)],
        permits: [permit(701, 501), permit(702, 501)],
        listings: [listing(701), listing(702, OTHER_LICENSEE)],
      }),
    );

    expect(plan).toEqual(
      planWith({
        splits: [{ fromSiteId: 501, siteCode: "BT1001", permitIds: [701] }],
        touchedSiteIds: [501],
        counts: { sitesSplit: 1, permitsMoved: 1 },
      }),
    );
  });

  it("splits onto the new operator's site when it exists, and keeps the old site", () => {
    const plan = planRemap(
      inputWith({
        sites: [site(501)],
        targets: [site(601, { operatorId: TO_OPERATOR })],
        permits: [permit(701, 501), permit(702, 501)],
        listings: [listing(701), listing(702, OTHER_LICENSEE)],
      }),
    );

    expect(plan).toEqual(
      planWith({
        moves: [{ permitId: 701, fromSiteId: 501, toSiteId: 601 }],
        remappedSiteIds: [601],
        touchedSiteIds: [501, 601],
        counts: { sitesSplit: 1, permitsMoved: 1 },
      }),
    );
  });

  it("blocks a permit that another licensee, which keeps the old operator, also lists", () => {
    const blocked = { sites: [site(501)], permits: [permit(701, 501)], listings: [listing(701), listing(701, OTHER_LICENSEE, 2)] };

    expect(planRemap(inputWith(blocked))).toEqual(planWith({ counts: { permitsBlocked: { count: 1, ids: [701] } } }));
  });

  it("moves that permit once the other licensee maps to the new operator too", () => {
    const operatorByLicensee = new Map([
      [LICENSEE, FROM_OPERATOR],
      [OTHER_LICENSEE, TO_OPERATOR],
    ]);
    const plan = planRemap(
      inputWith({ operatorByLicensee, sites: [site(501)], permits: [permit(701, 501)], listings: [listing(701), listing(701, OTHER_LICENSEE, 2)] }),
    );

    expect(plan.rekeyedSiteIds).toEqual([501]);
    expect(plan.counts.permitsBlocked).toEqual({ count: 0, ids: [] });
  });

  it("takes a listing without a licensee as naming the site's operator, so it blocks", () => {
    const plan = planRemap(inputWith({ sites: [site(501)], permits: [permit(701, 501)], listings: [listing(701), listing(701, null, 2)] }));

    expect(plan.counts.permitsBlocked).toEqual({ count: 1, ids: [701] });
    expect(plan.rekeyedSiteIds).toEqual([]);
  });

  it("removes the licensee's listings when it is unmapped, and moves nothing", () => {
    const plan = planRemap(
      inputWith({
        toOperatorId: null,
        sites: [site(501), site(502, { siteCode: "BT1002" })],
        permits: [permit(701, 501), permit(702, 502), permit(703, 502)],
        listings: [listing(701), listing(701, LICENSEE, 2), listing(702), listing(702, OTHER_LICENSEE, 2), listing(703, OTHER_LICENSEE)],
      }),
    );

    expect(plan).toEqual(
      planWith({
        unlistings: [
          { permitId: 701, datasetId: 1, officialSiteId: 501 },
          { permitId: 701, datasetId: 2, officialSiteId: 501 },
          { permitId: 702, datasetId: 1, officialSiteId: 502 },
        ],
        touchedSiteIds: [501],
        counts: { listingsRemoved: 3 },
      }),
    );
  });

  it("reports every blocked permit in the count and the first hundred by id", () => {
    const permitIds = Array.from({ length: REPORTED_IDS_LIMIT + 5 }, (_unused, index) => 700 + index);
    const plan = planRemap(
      inputWith({
        sites: [site(501)],
        permits: permitIds.map((id) => permit(id, 501)),
        listings: permitIds.flatMap((id) => [listing(id), listing(id, OTHER_LICENSEE, 2)]),
      }),
    );

    expect(plan.counts.permitsBlocked).toEqual({ count: REPORTED_IDS_LIMIT + 5, ids: permitIds.slice(0, REPORTED_IDS_LIMIT) });
  });

  it("refuses two sites of different operators that would become one", () => {
    const twoSites = {
      sites: [site(501), site(502, { operatorId: 6 })],
      permits: [permit(701, 501), permit(702, 502)],
      listings: [listing(701), listing(702)],
    };

    expect(() => planRemap(inputWith(twoSites))).toThrow("Two sites with the code BT1001 would move to one site");
  });

  it("re-keys a site the register names by its own id instead of merging it into a site with the same code", () => {
    const plan = planRemap(
      inputWith({
        sites: [site(501, { sourceRef: "0750000001" }), site(502, { siteCode: null, sourceRef: "0750000002" })],
        targets: [site(601, { operatorId: TO_OPERATOR })],
        permits: [permit(701, 501), permit(702, 502)],
        listings: [listing(701), listing(702)],
      }),
    );

    expect(plan).toEqual(
      planWith({
        rekeyedSiteIds: [501, 502],
        remappedSiteIds: [501, 502],
        touchedSiteIds: [501, 502],
        counts: { sitesRekeyed: 2, permitsMoved: 2 },
      }),
    );
  });

  it("blocks the moving permits of a site the register names by its own id instead of splitting it", () => {
    const plan = planRemap(
      inputWith({
        sites: [site(501, { sourceRef: "0750000001" })],
        permits: [permit(701, 501), permit(702, 501)],
        listings: [listing(701), listing(702, OTHER_LICENSEE)],
      }),
    );

    expect(plan).toEqual(planWith({ counts: { permitsBlocked: { count: 1, ids: [701] } } }));
  });
});

describe("a remap run", () => {
  it("does everything in one transaction after the ownership check, then maps the licensee and writes the change set", async () => {
    ownRun(2);
    scriptRemap({ fromOperatorId: FROM_OPERATOR, toOperatorId: TO_OPERATOR }, FROM_OPERATOR);
    scriptMapping();
    scriptThreeSites();
    dbMock.enqueueFor("update", "official.sites", undefined, undefined);
    dbMock.enqueueFor("insert", "official.sites", [{ id: 903, siteCode: "BT1003" }]);
    dbMock.enqueueFor("execute", undefined, [], [], []);
    dbMock.enqueueFor("delete", "official.permits", undefined);
    dbMock.enqueueFor("delete", "stations_official_sites", [{ stationId: 100, officialSiteId: 502 }]);
    dbMock.enqueueFor("execute", undefined, [{ id: "watch" }], [], [{ id: 7 }, { id: 9 }]);
    dbMock.enqueueFor("delete", "official.sites", undefined);
    dbMock.enqueueFor("update", "official.licensees", undefined);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("update", "official.import_runs", undefined, undefined);
    dbMock.enqueueFor("select", "official.import_run_datasets", []);

    expect(await processRun(remapRun(), environment)).toBe("done");

    expect(dbMock.pendingResults()).toBe(0);
    expect(trace()).toEqual([
      "begin",
      "select official.import_runs",
      "select official.remap_runs",
      "select official.licensees",
      "select official.sites",
      "select official.target",
      "select official.licensees",
      "select official.permits",
      "select official.permit_listings",
      "update official.sites",
      "insert official.sites",
      "execute",
      "execute",
      "execute",
      "delete official.permits",
      "delete stations_official_sites",
      "execute",
      "execute",
      "execute",
      "delete official.sites",
      "update official.sites",
      "update official.licensees",
      "insert official.import_changes",
      "update official.import_runs",
      "commit",
      "select official.import_run_datasets",
      "begin",
      "select official.import_runs",
      "update official.import_runs",
      "commit",
    ]);
    const [rekeyed, touched] = sitesWritten("update");
    const [split] = sitesWritten("insert");
    expect([rekeyed?.values, paramsOf(rekeyed?.clauses.where?.[0])]).toEqual([{ operator_id: TO_OPERATOR }, [[501]]]);
    expect(paramsOf(split?.clauses.select?.[0])).toEqual([TO_OPERATOR, STARTED_AT.toISOString(), STARTED_AT.toISOString(), [503]]);
    const [movedPermits, mergedListings, , , , repointedLists] = executedParams();
    expect(movedPermits).toEqual([
      [
        { permit_id: 703, to_site_id: 602 },
        { permit_id: 704, to_site_id: 903 },
      ],
    ]);
    expect(mergedListings).toEqual([[{ permit_id: 702, into_permit_id: 802 }]]);
    expect(paramsOf(dbMock.calls.find((call) => call.table === "stations_official_sites")?.clauses.where?.[0])).toEqual([502]);
    expect(repointedLists).toEqual([[{ site_id: 502, into_site_id: 602 }]]);
    expect([touched?.values, paramsOf(touched?.clauses.where?.[0])]).toEqual([{ updatedAt: STARTED_AT }, [[501, 602, 503]]]);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "official.licensees")?.values).toEqual({
      operatorId: TO_OPERATOR,
      brandId: null,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "official.import_changes")?.values).toEqual([
      { runId: RUN_ID, kind: "site_remapped", officialSiteId: 501 },
      { runId: RUN_ID, kind: "site_remapped", officialSiteId: 602 },
      { runId: RUN_ID, kind: "site_added", officialSiteId: 903 },
      { runId: RUN_ID, kind: "site_remapped", officialSiteId: 903 },
      { runId: RUN_ID, kind: "permit_moved_out", officialSiteId: 502, permitId: 703 },
      { runId: RUN_ID, kind: "permit_moved_in", officialSiteId: 602, permitId: 703 },
      { runId: RUN_ID, kind: "permit_moved_out", officialSiteId: 503, permitId: 704 },
      { runId: RUN_ID, kind: "permit_moved_in", officialSiteId: 903, permitId: 704 },
      { runId: RUN_ID, kind: "permit_moved_out", officialSiteId: 502, permitId: 702 },
      { runId: RUN_ID, kind: "station_unlinked", stationId: 100, officialSiteId: 502 },
    ]);
  });

  it("removes the licensee's listings when it is unmapped, records them and keeps the brand", async () => {
    scriptRemap({ fromOperatorId: FROM_OPERATOR, toOperatorId: null }, FROM_OPERATOR);
    scriptMapping();
    scriptReads({ sites: [site(501)], permits: [permit(701, 501)], listings: [listing(701)] });
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("update", "official.sites", undefined);
    dbMock.enqueueFor("update", "official.licensees", undefined);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);

    const report = await remapLicensee(tx, remapRun());

    expect(report).toMatchObject({ listingsRemoved: 1, permitsMoved: 0, sitesRekeyed: 0 });
    expect(trace().filter((operation) => !operation.startsWith("select"))).toEqual([
      "execute",
      "update official.sites",
      "update official.licensees",
      "insert official.import_changes",
    ]);
    expect(executedParams()).toEqual([[[{ permit_id: 701, dataset_id: 1 }], LICENSEE]]);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "official.licensees")?.values).toEqual({ operatorId: null });
    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toEqual([
      { runId: RUN_ID, kind: "permit_unlisted", officialSiteId: 501, permitId: 701 },
    ]);
  });

  it("fails before any write when the licensee's operator is neither the one it leaves nor the one it takes", async () => {
    ownRun(2);
    scriptRemap({ fromOperatorId: FROM_OPERATOR, toOperatorId: TO_OPERATOR }, 6);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    expect(await processRun(remapRun(), environment)).toBe("failed");

    expect(dbMock.pendingResults()).toBe(0);
    expect(trace().slice(0, 5)).toEqual([
      "begin",
      "select official.import_runs",
      "select official.remap_runs",
      "select official.licensees",
      "rollback",
    ]);
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({
      state: "failed",
      error: "The operator of licensee 8 changed after this remap was queued",
    });
  });

  it("writes nothing again when a later attempt finds the remap applied", async () => {
    scriptRemap({ fromOperatorId: FROM_OPERATOR, toOperatorId: TO_OPERATOR }, TO_OPERATOR);
    scriptMapping();
    scriptReads({ sites: [site(501, { operatorId: TO_OPERATOR })], targets: [], permits: [permit(701, 501)], listings: [listing(701)] });
    dbMock.enqueueFor("update", "official.licensees", undefined);

    const report = await remapLicensee(tx, remapRun({ attempt: 2 }));

    expect(report).toMatchObject({ sitesRekeyed: 0, permitsMoved: 0 });
    expect(trace().filter((operation) => !operation.startsWith("select"))).toEqual(["update official.licensees"]);
  });

  it("refuses a licensee of another source", async () => {
    dbMock.enqueueFor("select", "official.remap_runs", [{ licenseeId: LICENSEE, fromOperatorId: FROM_OPERATOR, toOperatorId: TO_OPERATOR }]);
    dbMock.enqueueFor("select", "official.licensees", [{ sourceId: 2, operatorId: FROM_OPERATOR }]);

    await expect(remapLicensee(tx, remapRun())).rejects.toThrow("Licensee 8 belongs to another source");
  });

  it("reports a dry run and rolls it back", async () => {
    dbMock.enqueueFor("select", "official.import_run_datasets", []);
    ownRun(3);
    dbMock.enqueueFor("select", "official.licensees", []);
    scriptRemap({ fromOperatorId: FROM_OPERATOR, toOperatorId: TO_OPERATOR }, FROM_OPERATOR);
    scriptMapping();
    scriptThreeSites();
    dbMock.enqueueFor("update", "official.sites", undefined, undefined);
    dbMock.enqueueFor("insert", "official.sites", [{ id: 903, siteCode: "BT1003" }]);
    dbMock.enqueueFor("execute", undefined, [], [], []);
    dbMock.enqueueFor("delete", "official.permits", undefined);
    dbMock.enqueueFor("delete", "stations_official_sites", []);
    dbMock.enqueueFor("execute", undefined, [{ id: "watch" }], [{ id: "notice" }, { id: "other notice" }], [{ id: 7 }]);
    dbMock.enqueueFor("delete", "official.sites", undefined);
    dbMock.enqueueFor("update", "official.licensees", undefined);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("update", "official.import_runs", undefined, undefined);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_skips", []);
    dbMock.enqueueFor("select", "official.import_changes", [{ datasetId: null, slice: null, kind: "site_remapped", count: 3 }]);
    dbMock.enqueueFor("select", "official.import_run_datasets", []);

    const end = await processDryRun(remapRun({ isDryRun: true }), environment);

    expect(dbMock.pendingResults()).toBe(0);
    expect(JSON.parse(JSON.stringify(end))).toEqual(end);
    expect(end).toMatchObject({
      end: "done",
      report: {
        afterStepChanges: { site_remapped: 3 },
        remap: {
          sitesRekeyed: 1,
          sitesMerged: 1,
          sitesSplit: 1,
          permitsMoved: 4,
          permitsMerged: 1,
          permitsBlocked: { count: 1, ids: [705] },
          listingsRemoved: 0,
          watchesRepointed: 1,
          notificationsRepointed: 2,
          listsRepointed: 1,
        },
      },
    });
    expect(trace().filter((operation) => operation === "rollback")).toHaveLength(1);
  });
});
