import { beforeEach, describe, expect, it } from "vitest";

import { links } from "../../../../../src/features/official/import/steps/links.js";
import { type DatabaseCall, dbMock } from "../../../../helpers/boundaries.js";
import {
  RUN_ID,
  change,
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptStepFinish,
  scriptStepStart,
  trace,
  transactionsOf,
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

const GROUP_CHANGING_KINDS = ["site_added", "site_moved", "site_remapped", "permit_added", "permit_archived"];
const X = { longitude: 21, latitude: 52 };

function permitRow(permitId: number, officialSiteId: number, operatorId: number, siteId: string, link: { id: number; stationId: number } | null) {
  return { permitId, officialSiteId, sourceId: 1, operatorId, siteId, ...X, linkId: link?.id ?? null, linkedStationId: link?.stationId ?? null };
}

function stationRow(stationId: number, operatorId: number, siteId: string) {
  return { stationId, operatorId, siteId, ...X };
}

function isCorrectionRead(call: DatabaseCall): boolean {
  return call.operation === "select" && call.clauses.where?.[0] !== undefined && whereOf(call).sql.includes("link_group");
}

function correctedGroups(): unknown[] {
  return dbMock.calls
    .filter((call) => isCorrectionRead(call) && call.clauses.for !== undefined)
    .map((call) => JSON.parse(String(whereOf(call).params[0])));
}

function changeReads(): unknown[][] {
  return dbMock.calls.filter((call) => call.table === "official.import_changes" && call.operation === "select").map((call) => whereOf(call).params);
}

beforeEach(recordTransactions);

describe("the links step", () => {
  it("corrects the groups of the sites a run changed and records the pairs with its progress, in one transaction", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(11, "site_added", { datasetId: 1, slice: "north", officialSiteId: 504 }),
      change(12, "site_moved", { datasetId: 1, slice: "north", officialSiteId: 503, fromLocationId: 11 }),
      change(13, "permit_added", { datasetId: 1, slice: "north", officialSiteId: 504, permitId: 701 }),
      change(20, "permit_archived", { officialSiteId: 502, permitId: 600 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [
      { id: 502, operatorId: 4, siteId: "BT1002" },
      { id: 503, operatorId: 4, siteId: "BT1003" },
      { id: 504, operatorId: 4, siteId: "BT1001" },
    ]);
    dbMock.enqueueStationLinks(
      [{ id: 100 }, { id: 103 }],
      [permitRow(701, 504, 4, "BT1001", null), permitRow(650, 503, 4, "BT1003", { id: 9005, stationId: 104 })],
      [stationRow(100, 4, "BT1001"), stationRow(103, 4, "BT1003")],
    );
    dbMock.enqueueFor("insert", "stations_permits", [
      { stationId: 100, permitId: 701 },
      { stationId: 103, permitId: 650 },
    ]);
    dbMock.enqueueFor("delete", "stations_permits", [{ stationId: 104, permitId: 650 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links);

    expect(dbMock.pendingResults()).toBe(0);
    const [, work] = transactionsOf(trace());
    expect(work).toEqual([
      "select official.import_runs",
      "select official.import_changes",
      "select official.sites",
      "select stations",
      "select official.sites",
      "select stations",
      "insert stations_permits",
      "delete stations_permits",
      "insert official.import_changes",
      "update official.import_run_steps",
      "commit",
    ]);
    expect(changeReads()).toEqual([[RUN_ID, ...GROUP_CHANGING_KINDS]]);
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.import_changes")).sql).toMatch(
      /"official_site_id" in .+"site_id" is not null/,
    );
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.sites")).params).toEqual([504, 503, 502]);
    expect(correctedGroups()).toEqual([
      [
        { operatorId: 4, siteId: "BT1002" },
        { operatorId: 4, siteId: "BT1003" },
        { operatorId: 4, siteId: "BT1001" },
      ],
    ]);
    expect(valuesOf("insert", "official.import_changes")).toEqual([
      [
        { runId: RUN_ID, kind: "station_linked", stationId: 100, permitId: 701 },
        { runId: RUN_ID, kind: "station_linked", stationId: 103, permitId: 650 },
        { runId: RUN_ID, kind: "station_unlinked", stationId: 104, permitId: 650 },
      ],
    ]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ lastSeq: 20 }, { finishedAt: expect.anything() }]);
  });

  it("resumes after the last change an earlier attempt handled, and finds nothing to write where the pairs are already right", async () => {
    scriptStepStart({ lastSeq: 15 });
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(16, "permit_added", { datasetId: 1, slice: "north", officialSiteId: 504, permitId: 701 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [{ id: 504, operatorId: 4, siteId: "BT1001" }]);
    dbMock.enqueueStationLinks([{ id: 100 }], [permitRow(701, 504, 4, "BT1001", { id: 9001, stationId: 100 })], [stationRow(100, 4, "BT1001")]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ attempt: 2 }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(changeReads()).toEqual([[RUN_ID, ...GROUP_CHANGING_KINDS, 15]]);
    expect(
      dbMock.calls.some((call) => call.table === "stations_permits" || (call.table === "official.import_changes" && call.operation === "insert")),
    ).toBe(false);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ error: null }, { lastSeq: 16 }, { finishedAt: expect.anything() }]);
  });

  it("walks the change set a page a transaction", async () => {
    const firstPage = Array.from({ length: 1000 }, (_unused, index) =>
      change(index + 1, "site_added", { datasetId: 1, slice: "north", officialSiteId: 504 }),
    );
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", firstPage, []);
    dbMock.enqueueFor("select", "official.sites", [{ id: 504, operatorId: 4, siteId: "BT1001" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links);

    expect(dbMock.pendingResults()).toBe(0);
    const [, firstWork, secondWork] = transactionsOf(trace());
    expect(firstWork?.at(-2)).toBe("update official.import_run_steps");
    expect(secondWork).toEqual(["select official.import_runs", "select official.import_changes", "commit"]);
    expect(changeReads()).toEqual([
      [RUN_ID, ...GROUP_CHANGING_KINDS],
      [RUN_ID, ...GROUP_CHANGING_KINDS, 1000],
    ]);
    expect(correctedGroups()).toEqual([[{ operatorId: 4, siteId: "BT1001" }]]);
  });

  it("skips a change whose site is gone", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [change(11, "permit_archived", { officialSiteId: 502, permitId: 600 })]);
    dbMock.enqueueFor("select", "official.sites", []);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links);

    expect(dbMock.pendingResults()).toBe(0);
    expect(correctedGroups()).toEqual([]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ lastSeq: 11 }, { finishedAt: expect.anything() }]);
  });

  it("corrects both groups of a remapped site: the one it has now, and the one of the operator the remap took it from", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(31, "site_remapped", { officialSiteId: 520 }),
      change(32, "site_remapped", { officialSiteId: 530 }),
      change(33, "permit_added", { datasetId: 1, slice: "north", officialSiteId: 540, permitId: 850 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [
      { id: 520, operatorId: 7, siteId: "BT2000" },
      { id: 530, operatorId: 7, siteId: "BT3000" },
      { id: 540, operatorId: 7, siteId: "BT4000" },
    ]);
    dbMock.enqueueFor("select", "official.remap_runs", [{ fromOperatorId: 4 }]);
    dbMock.enqueueStationLinks(
      [{ id: 200 }, { id: 201 }],
      [permitRow(800, 520, 7, "BT2000", { id: 9100, stationId: 200 }), permitRow(810, 530, 7, "BT3000", null)],
      [stationRow(200, 4, "BT2000"), stationRow(201, 7, "BT2000")],
    );
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 201, permitId: 800 }]);
    dbMock.enqueueFor("delete", "stations_permits", [{ stationId: 200, permitId: 800 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ kind: "remap" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.remap_runs")).params).toEqual([RUN_ID]);
    expect(correctedGroups()).toEqual([
      [
        { operatorId: 7, siteId: "BT2000" },
        { operatorId: 7, siteId: "BT3000" },
        { operatorId: 7, siteId: "BT4000" },
        { operatorId: 4, siteId: "BT2000" },
        { operatorId: 4, siteId: "BT3000" },
      ],
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "stations_permits")?.values).toEqual([
      { station_id: 201, permit_id: 800 },
    ]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete" && call.table === "stations_permits")).params).toEqual([9100]);
    expect(valuesOf("insert", "official.import_changes")).toEqual([
      [
        { runId: RUN_ID, kind: "station_linked", stationId: 201, permitId: 800 },
        { runId: RUN_ID, kind: "station_unlinked", stationId: 200, permitId: 800 },
      ],
    ]);
  });

  it("fails rather than guess the former operator when a remapped site's run has no remap row", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [change(31, "site_remapped", { officialSiteId: 520 })]);
    dbMock.enqueueFor("select", "official.sites", [{ id: 520, operatorId: 7, siteId: "BT2000" }]);
    dbMock.enqueueFor("select", "official.remap_runs", []);
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);

    await expect(runStep(links, { run: claimedRun({ kind: "remap" }) })).rejects.toThrow(
      `After-step links failed: Import run ${RUN_ID} remapped sites without a remap row`,
    );
    expect(correctedGroups()).toEqual([]);
    expect(dbMock.calls.some((call) => call.table === "stations_permits")).toBe(false);
  });

  it("corrects every group for a relink run, a page of groups a transaction, without walking the change set", async () => {
    const firstPage = Array.from({ length: 500 }, (_unused, index) => ({ siteId: `BT${String(index).padStart(4, "0")}`, operatorId: 4 }));
    const lastGroup = { siteId: "BT0500", operatorId: 5 };
    scriptStepStart();
    ownRun(3);
    dbMock.enqueueFor("select", "official.sites", firstPage, [lastGroup], []);
    dbMock.enqueueStationLinks([], [], [{ id: 300 }], [permitRow(900, 600, 5, "BT0500", null)], [stationRow(300, 5, "BT0500")]);
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 300, permitId: 900 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ kind: "relink" }) });

    expect(dbMock.pendingResults()).toBe(0);
    const [, firstWork, secondWork, lastWork] = transactionsOf(trace());
    expect(firstWork).toEqual(["select official.import_runs", "select official.sites", "select stations", "select official.sites", "commit"]);
    expect(secondWork).toEqual([
      "select official.import_runs",
      "select official.sites",
      "select stations",
      "select official.sites",
      "select stations",
      "insert stations_permits",
      "insert official.import_changes",
      "commit",
    ]);
    expect(lastWork).toEqual(["select official.import_runs", "select official.sites", "commit"]);
    const pageReads = dbMock.calls.filter((call) => call.table === "official.sites" && call.clauses.limit !== undefined);
    expect(whereOf(pageReads[0]).params).toEqual([]);
    expect(pageReads.slice(1).map((call) => whereOf(call).params)).toEqual([
      ["BT0499", 4],
      ["BT0500", 5],
    ]);
    expect(correctedGroups().map((groups) => (groups as unknown[]).length)).toEqual([500, 1]);
    expect(changeReads()).toEqual([]);
    expect(valuesOf("insert", "official.import_changes")).toEqual([[{ runId: RUN_ID, kind: "station_linked", stationId: 300, permitId: 900 }]]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ finishedAt: expect.anything() }]);
  });

  it("goes through the pages again when a relink is taken over, and finds nothing where they are already right", async () => {
    scriptStepStart({ lastSeq: null });
    ownRun(2);
    dbMock.enqueueFor("select", "official.sites", [{ siteId: "BT1001", operatorId: 4 }], []);
    dbMock.enqueueStationLinks([{ id: 100 }], [permitRow(700, 501, 4, "BT1001", { id: 9001, stationId: 100 })], [stationRow(100, 4, "BT1001")]);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ kind: "relink", attempt: 2 }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "stations_permits" || call.table === "official.import_changes")).toBe(false);
  });

  it("takes no station row lock in a dry run, for the changed groups or for every group", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(11, "permit_added", { datasetId: 1, slice: "north", officialSiteId: 504, permitId: 701 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [{ id: 504, operatorId: 4, siteId: "BT1001" }]);
    dbMock.enqueueStationLinks([permitRow(701, 504, 4, "BT1001", null)], [stationRow(100, 4, "BT1001")]);
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 100, permitId: 701 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ isDryRun: true }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.clauses.for !== undefined && call.table === "stations")).toBe(false);
    expect(valuesOf("insert", "official.import_changes")).toEqual([[{ runId: RUN_ID, kind: "station_linked", stationId: 100, permitId: 701 }]]);

    dbMock.calls.length = 0;
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.sites", [{ siteId: "BT1001", operatorId: 4 }], []);
    dbMock.enqueueStationLinks([permitRow(700, 501, 4, "BT1001", null)], [stationRow(100, 4, "BT1001")]);
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 100, permitId: 700 }]);
    dbMock.enqueueFor("insert", "official.import_changes", undefined);
    scriptStepFinish();

    await runStep(links, { run: claimedRun({ kind: "relink", isDryRun: true }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.clauses.for !== undefined && call.table === "stations")).toBe(false);
  });
});
