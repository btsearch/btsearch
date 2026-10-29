import { beforeEach, describe, expect, it } from "vitest";

import type { SiteChangeSummary } from "../../../../../src/features/official/import/steps/siteChanges.js";
import {
  type LinkedSite,
  type StationLinkSummary,
  type StoredStation,
  stationNotificationOf,
  stationNotifications,
  summarizeStationLinks,
  withKeptLinks,
} from "../../../../../src/features/official/import/steps/stationNotifications.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  RUN_ID,
  change,
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptStepFinish,
  scriptStepStart,
  statementOf,
  trace,
  transactionsOf,
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

const WATCHER = "0199d000-0000-7000-8000-0000000000a1";

function summary(overrides: Partial<StationLinkSummary> = {}): StationLinkSummary {
  return { stationId: 100, lastSeq: 9, linkedSiteId: null, unlinkedSiteId: null, keptSiteId: null, ...overrides };
}

function storedStation(overrides: Partial<StoredStation> = {}): StoredStation {
  return { id: 100, siteCode: "BT1001", latitude: 52.2297, longitude: 21.0123, ...overrides };
}

function linkedSite(id: number, permitCount: number): LinkedSite {
  return { id, latitude: 52.23, longitude: 21.01, permitCount };
}

function siteChange(officialSiteId: number, overrides: Partial<SiteChangeSummary> = {}): SiteChangeSummary {
  return { officialSiteId, lastSeq: 1, wasAdded: false, permitsAdded: 0, permitsArchived: 0, ...overrides };
}

function byId<Row>(rows: readonly Row[], idOf: (row: Row) => number): Map<number, Row> {
  return new Map(rows.map((row) => [idOf(row), row]));
}

function scriptRecipients(ourStations: readonly { stationId: number; watchers?: readonly string[] }[]): void {
  dbMock.enqueueFor(
    "select",
    "station_watches",
    ourStations.flatMap(({ stationId, watchers = [] }) => watchers.map((userId) => ({ watchedId: stationId, userId }))),
  );
  dbMock.enqueueFor("execute", undefined, []);
  dbMock.enqueueFor(
    "select",
    "stations",
    ourStations.map(({ stationId }) => ({ stationId, operatorName: "Orange", operatorMnc: 26003 })),
  );
  const watchers = [...new Set(ourStations.flatMap((station) => station.watchers ?? []))];
  if (watchers.length > 0) {
    dbMock.enqueueFor(
      "select",
      "users",
      watchers.map((id) => ({ id, locale: "pl-PL" })),
    );
  }
}

beforeEach(recordTransactions);

describe("the link changes of a run, per station of ours", () => {
  it("lists the official sites a station was linked to and the ones it was unlinked from", () => {
    const changes = [
      change(1, "site_added", { officialSiteId: 503 }),
      change(21, "station_linked", { stationId: 100, officialSiteId: 503 }),
      change(15, "station_unlinked", { stationId: 100, officialSiteId: 502 }),
      change(23, "station_unlinked", { stationId: 101, officialSiteId: 504 }),
    ];

    expect(summarizeStationLinks(changes)).toEqual([
      { stationId: 100, lastSeq: 21, linkedSiteId: 503, unlinkedSiteId: 502, keptSiteId: null },
      { stationId: 101, lastSeq: 23, linkedSiteId: null, unlinkedSiteId: 504, keptSiteId: null },
    ]);
  });

  it.each([
    { case: "linked and then unlinked", kinds: ["station_linked", "station_unlinked"] as const },
    { case: "unlinked and then linked again", kinds: ["station_unlinked", "station_linked"] as const },
  ])("counts nothing for a site that the run $case", ({ kinds }) => {
    const [station] = summarizeStationLinks(kinds.map((kind, index) => change(30 + index, kind, { stationId: 100, officialSiteId: 501 })));

    expect(station).toEqual({ stationId: 100, lastSeq: 31, linkedSiteId: null, unlinkedSiteId: null, keptSiteId: null });
  });

  it("adds the sites whose permits changed while they stayed linked, but not a site the station was linked to in the run", () => {
    const summaries = [summary({ stationId: 100, lastSeq: 21, linkedSiteId: 503 }), summary({ stationId: 103, lastSeq: 25 })];
    const keptLinks = [
      { stationId: 100, officialSiteId: 503 },
      { stationId: 101, officialSiteId: 501 },
      { stationId: 102, officialSiteId: 505 },
      { stationId: 103, officialSiteId: 507 },
    ];
    const siteChanges = byId(
      [
        siteChange(503, { lastSeq: 12, wasAdded: true, permitsAdded: 2 }),
        siteChange(501, { lastSeq: 30, permitsAdded: 1 }),
        siteChange(505, { lastSeq: 8, permitsArchived: 1 }),
        siteChange(507, { lastSeq: 9, permitsAdded: 1 }),
      ],
      (site) => site.officialSiteId,
    );

    expect(withKeptLinks(summaries, keptLinks, siteChanges)).toEqual([
      summary({ stationId: 102, lastSeq: 8, keptSiteId: 505 }),
      summary({ stationId: 100, lastSeq: 21, linkedSiteId: 503 }),
      summary({ stationId: 103, lastSeq: 25, keptSiteId: 507 }),
      summary({ stationId: 101, lastSeq: 30, keptSiteId: 501 }),
    ]);
  });
});

describe("the notification of one of our stations", () => {
  const sites = byId(
    [linkedSite(501, 2), linkedSite(502, 3), linkedSite(503, 2), linkedSite(505, 0), linkedSite(506, 4), linkedSite(507, 1)],
    (site) => site.id,
  );
  const siteChanges = byId(
    [
      siteChange(502, { permitsAdded: 1, permitsArchived: 2 }),
      siteChange(503, { wasAdded: true, permitsAdded: 2 }),
      siteChange(505, { permitsArchived: 1 }),
      siteChange(506, { permitsAdded: 1, permitsArchived: 1 }),
      siteChange(507, { permitsArchived: 2 }),
    ],
    (site) => site.officialSiteId,
  );

  it.each([
    {
      case: "every permit of a site that was there before, now linked",
      summary: summary({ linkedSiteId: 501 }),
      metadata: { permits_added: 2, permits_deleted: 0, official_sites_added: 0, count: 2 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
    },
    {
      case: "a site the run added, now linked",
      summary: summary({ linkedSiteId: 503 }),
      metadata: { permits_added: 2, permits_deleted: 0, official_sites_added: 1, count: 3 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U503",
    },
    {
      case: "the permits it had on a site it was unlinked from",
      summary: summary({ unlinkedSiteId: 502 }),
      metadata: { permits_added: 0, permits_deleted: 4, official_sites_added: 0, count: 4 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
    {
      case: "a site that lost its last permit and its link",
      summary: summary({ unlinkedSiteId: 505 }),
      metadata: { permits_added: 0, permits_deleted: 1, official_sites_added: 0, count: 1 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
    {
      case: "a link moved from one site to another",
      summary: summary({ linkedSiteId: 501, unlinkedSiteId: 502 }),
      metadata: { permits_added: 2, permits_deleted: 4, official_sites_added: 0, count: 6 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
    },
    {
      case: "a linked site that is gone again by now",
      summary: summary({ linkedSiteId: 508, unlinkedSiteId: 505 }),
      metadata: { permits_added: 0, permits_deleted: 1, official_sites_added: 0, count: 1 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
    {
      case: "the permits added to and archived from a site that stays linked",
      summary: summary({ keptSiteId: 506 }),
      metadata: { permits_added: 1, permits_deleted: 1, official_sites_added: 0, count: 2 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U506",
    },
    {
      case: "permits archived from a site that stays linked",
      summary: summary({ keptSiteId: 507 }),
      metadata: { permits_added: 0, permits_deleted: 2, official_sites_added: 0, count: 2 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
  ])("tells of $case", ({ summary: links, metadata, actionUrl }) => {
    expect(stationNotificationOf(links, storedStation(), sites, siteChanges)).toEqual({
      stationId: 100,
      stationStringId: "BT1001",
      type: "station_official_permit_added",
      metadata,
      actionUrl,
    });
  });

  it("is not written when nothing countable changed", () => {
    expect(stationNotificationOf(summary({ linkedSiteId: 508 }), storedStation(), sites, siteChanges)).toBeNull();
  });
});

describe("the station notifications step", () => {
  it("notifies the watchers of each station whose links changed, and saves its progress with the rows it wrote", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(3, "site_added", { officialSiteId: 503 }),
      change(4, "permit_added", { officialSiteId: 503, permitId: 703 }),
      change(5, "permit_archived", { officialSiteId: 505, permitId: 651 }),
      change(21, "station_linked", { stationId: 100, officialSiteId: 503 }),
      change(22, "station_unlinked", { stationId: 100, officialSiteId: 502 }),
      change(23, "station_unlinked", { stationId: 101, officialSiteId: 505 }),
      change(24, "station_unlinked", { stationId: 102, officialSiteId: 504 }),
    ]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ stationId: 100, officialSiteId: 503 }]);
    dbMock.enqueueFor("select", "stations", [storedStation(), storedStation({ id: 101, siteCode: "BT1002", latitude: null, longitude: null })]);
    dbMock.enqueueFor("select", "official.sites", [linkedSite(503, 1), linkedSite(502, 1), linkedSite(505, 0)]);
    scriptRecipients([
      { stationId: 100, watchers: [WATCHER] },
      { stationId: 101, watchers: [WATCHER] },
    ]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], [{ id: "n-2" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    const [, read, write] = transactionsOf(trace());
    expect(read).toEqual(["select official.import_runs", "select official.import_changes", "select stations_official_sites", "commit"]);
    expect(write?.slice(0, 3)).toEqual(["select official.import_runs", "select stations", "select official.sites"]);
    expect(write?.slice(-2)).toEqual(["update official.import_run_steps", "commit"]);
    expect(write?.filter((operation) => operation === "insert notifications")).toHaveLength(2);
    expect(write?.filter((operation) => operation === "select station_watches" || operation === "select stations")).toEqual([
      "select stations",
      "select station_watches",
      "select stations",
    ]);
    expect(write?.filter((operation) => operation === "select users")).toEqual(["select users"]);

    const changesRead = dbMock.calls.find((call) => call.table === "official.import_changes");
    const keptLinksRead = dbMock.calls.find((call) => call.table === "stations_official_sites");
    const stationsRead = dbMock.calls.find((call) => call.operation === "select" && call.table === "stations");
    const sitesRead = dbMock.calls.find((call) => call.table === "official.sites");
    const [listsRead] = dbMock.calls.filter((call) => call.operation === "execute").map(statementOf);
    expect(whereOf(changesRead).params).toEqual([
      RUN_ID,
      "site_added",
      "permit_added",
      "permit_moved_in",
      "permit_archived",
      "permit_moved_out",
      "station_linked",
      "station_unlinked",
    ]);
    expect(whereOf(keptLinksRead).params).toEqual([[503, 505]]);
    expect(whereOf(stationsRead).params).toEqual([[100, 101, 102]]);
    expect(whereOf(sitesRead).params).toEqual([[503, 502, 505, 504]]);
    expect(listsRead?.params).toEqual([[100, 101]]);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        userId: WATCHER,
        stationId: 100,
        officialSiteId: null,
        type: "station_official_permit_added",
        title: "Zmieniono pozwolenia stacji",
        metadata: {
          station_id: "BT1001",
          station_operator_name: "Orange",
          station_operator_mnc: 26003,
          permits_added: 1,
          permits_deleted: 1,
          official_sites_added: 1,
          count: 3,
        },
        actionUrl: "/#map=16.00/52.23/21.01~fu~U503",
      }),
      expect.objectContaining({
        stationId: 101,
        metadata: expect.objectContaining({ station_id: "BT1002", permits_added: 0, permits_deleted: 1, official_sites_added: 0, count: 1 }),
        actionUrl: null,
      }),
    ]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ lastSeq: 24 });
  });

  it("tells the watchers of a station whose site stayed linked of the permits the run added to it and archived from it", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(4, "permit_added", { officialSiteId: 501, permitId: 705 }),
      change(5, "permit_archived", { officialSiteId: 501, permitId: 600 }),
      change(6, "permit_archived", { officialSiteId: 506, permitId: 610 }),
    ]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);
    dbMock.enqueueFor("select", "stations", [storedStation()]);
    dbMock.enqueueFor("select", "official.sites", [linkedSite(501, 3)]);
    scriptRecipients([{ stationId: 100, watchers: [WATCHER] }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    expect(whereOf(dbMock.calls.find((call) => call.table === "stations_official_sites")).params).toEqual([[501, 506]]);
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.sites")).params).toEqual([[501]]);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        stationId: 100,
        metadata: expect.objectContaining({ permits_added: 1, permits_deleted: 1, official_sites_added: 0, count: 2 }),
        actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
      }),
    ]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ lastSeq: 5 });
  });

  it("tells a station on a site a remap emptied how many permits moved away, and a station on the site they moved to that they were added", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(5, "permit_moved_out", { officialSiteId: 502, permitId: 703 }),
      change(6, "permit_moved_in", { officialSiteId: 602, permitId: 703 }),
      change(7, "permit_moved_out", { officialSiteId: 502, permitId: 702 }),
      change(8, "station_unlinked", { stationId: 100, officialSiteId: 502 }),
    ]);
    dbMock.enqueueFor("select", "stations_official_sites", [{ stationId: 101, officialSiteId: 602 }]);
    dbMock.enqueueFor("select", "stations", [storedStation(), storedStation({ id: 101, siteCode: "BT1002" })]);
    dbMock.enqueueFor("select", "official.sites", [linkedSite(602, 2)]);
    scriptRecipients([
      { stationId: 100, watchers: [WATCHER] },
      { stationId: 101, watchers: [WATCHER] },
    ]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], [{ id: "n-2" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications, { run: claimedRun({ kind: "remap" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(whereOf(dbMock.calls.find((call) => call.table === "stations_official_sites")).params).toEqual([[602, 502]]);
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.sites")).params).toEqual([[602, 502]]);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        stationId: 101,
        metadata: expect.objectContaining({ permits_added: 1, permits_deleted: 0, official_sites_added: 0, count: 1 }),
        actionUrl: "/#map=16.00/52.23/21.01~fu~U602",
      }),
      expect.objectContaining({
        stationId: 100,
        metadata: expect.objectContaining({ permits_added: 0, permits_deleted: 2, official_sites_added: 0, count: 2 }),
        actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
      }),
    ]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ lastSeq: 8 });
  });

  it("tells of the links a relink run corrected, with no site of its own", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [change(1, "station_linked", { stationId: 100, officialSiteId: 501 })]);
    dbMock.enqueueFor("select", "stations", [storedStation()]);
    dbMock.enqueueFor("select", "official.sites", [linkedSite(501, 2)]);
    scriptRecipients([{ stationId: 100, watchers: [WATCHER] }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications, { run: claimedRun({ kind: "relink" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.table === "stations_official_sites")).toBe(false);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        stationId: 100,
        metadata: expect.objectContaining({ permits_added: 2, permits_deleted: 0, official_sites_added: 0, count: 2 }),
        actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
      }),
    ]);
  });
});
