import { beforeEach, describe, expect, it } from "vitest";

import {
  type LinkedPermit,
  type StationLinkSummary,
  type StoredStation,
  addedSiteIdsOf,
  stationNotificationOf,
  stationNotifications,
  summarizeStationLinks,
} from "../../../../../src/features/official/import/steps/stationNotifications.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
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
const LABELS = [[/^SELECT link\.station_id AS "stationId"/, "read the linked permits"]] as const;

function summary(overrides: Partial<StationLinkSummary> = {}): StationLinkSummary {
  return { stationId: 100, lastSeq: 9, linkedPermitIds: [], unlinkedPermitIds: [], ...overrides };
}

function storedStation(overrides: Partial<StoredStation> = {}): StoredStation {
  return { id: 100, siteCode: "BT1001", latitude: 52.2297, longitude: 21.0123, ...overrides };
}

function linkedPermit(permitId: number, officialSiteId: number, stationId = 100): LinkedPermit {
  return { stationId, permitId, officialSiteId, latitude: 52.23, longitude: 21.01 };
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
  if (watchers.length > 0)
    dbMock.enqueueFor(
      "select",
      "users",
      watchers.map((id) => ({ id, locale: "pl-PL" })),
    );
}

beforeEach(recordTransactions);

describe("the link changes of a run, per station of ours", () => {
  it("lists the permits a station gained and the ones it lost", () => {
    const changes = [
      change(1, "site_added", { officialSiteId: 503 }),
      change(21, "station_linked", { stationId: 100, permitId: 702 }),
      change(22, "station_linked", { stationId: 100, permitId: 701 }),
      change(15, "station_unlinked", { stationId: 100, permitId: 650 }),
      change(23, "station_unlinked", { stationId: 101, permitId: 651 }),
    ];

    expect(summarizeStationLinks(changes)).toEqual([
      { stationId: 100, lastSeq: 22, linkedPermitIds: [701, 702], unlinkedPermitIds: [650] },
      { stationId: 101, lastSeq: 23, linkedPermitIds: [], unlinkedPermitIds: [651] },
    ]);
    expect([...addedSiteIdsOf(changes)]).toEqual([503]);
  });

  it.each([
    { case: "linked and then unlinked", kinds: ["station_linked", "station_unlinked"] as const },
    { case: "unlinked and then linked again", kinds: ["station_unlinked", "station_linked"] as const },
  ])("counts nothing for a permit that the run $case", ({ kinds }) => {
    const [station] = summarizeStationLinks(kinds.map((kind, index) => change(30 + index, kind, { stationId: 100, permitId: 701 })));

    expect(station).toEqual({ stationId: 100, lastSeq: 31, linkedPermitIds: [], unlinkedPermitIds: [] });
  });
});

describe("the notification of one of our stations", () => {
  it.each([
    {
      case: "permits linked on a site that was there before",
      summary: summary({ linkedPermitIds: [701, 702] }),
      linkedPermits: [linkedPermit(701, 501), linkedPermit(702, 501)],
      metadata: { permits_added: 2, permits_deleted: 0, official_sites_added: 0, count: 2 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
    },
    {
      case: "permits linked on two sites, one of them added by the run",
      summary: summary({ linkedPermitIds: [701, 703, 704] }),
      linkedPermits: [linkedPermit(701, 501), linkedPermit(703, 503), linkedPermit(704, 503)],
      metadata: { permits_added: 3, permits_deleted: 0, official_sites_added: 1, count: 4 },
      actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
    },
    {
      case: "a permit lost and none gained",
      summary: summary({ unlinkedPermitIds: [650] }),
      linkedPermits: [],
      metadata: { permits_added: 0, permits_deleted: 1, official_sites_added: 0, count: 1 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
    {
      case: "a linked permit that is gone again by now",
      summary: summary({ linkedPermitIds: [701], unlinkedPermitIds: [650] }),
      linkedPermits: [],
      metadata: { permits_added: 0, permits_deleted: 1, official_sites_added: 0, count: 1 },
      actionUrl: "/#map=16.00/52.2297/21.0123~f~S100",
    },
  ])("tells of $case", ({ summary: links, linkedPermits, metadata, actionUrl }) => {
    expect(stationNotificationOf(links, storedStation(), linkedPermits, new Set([503]))).toEqual({
      stationId: 100,
      stationStringId: "BT1001",
      type: "station_official_permit_added",
      metadata,
      actionUrl,
    });
  });

  it("is not written when nothing countable changed", () => {
    expect(stationNotificationOf(summary({ linkedPermitIds: [701] }), storedStation(), [], new Set())).toBeNull();
  });
});

describe("the station notifications step", () => {
  it("notifies the watchers of each station whose links changed, and saves its progress with the rows it wrote", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(3, "site_added", { officialSiteId: 503 }),
      change(21, "station_linked", { stationId: 100, permitId: 703 }),
      change(22, "station_unlinked", { stationId: 100, permitId: 650 }),
      change(23, "station_unlinked", { stationId: 101, permitId: 651 }),
      change(24, "station_unlinked", { stationId: 102, permitId: 652 }),
    ]);
    dbMock.enqueueFor("select", "stations", [storedStation(), storedStation({ id: 101, siteCode: "BT1002", latitude: null, longitude: null })]);
    dbMock.enqueueFor("execute", undefined, [linkedPermit(703, 503)]);
    scriptRecipients([
      { stationId: 100, watchers: [WATCHER] },
      { stationId: 101, watchers: [WATCHER] },
    ]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], [{ id: "n-2" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    const [, read, write] = transactionsOf(trace(LABELS));
    expect(read).toEqual(["select official.import_runs", "select official.import_changes", "commit"]);
    expect(write?.slice(0, 3)).toEqual(["select official.import_runs", "select stations", "read the linked permits"]);
    expect(write?.slice(-2)).toEqual(["update official.import_run_steps", "commit"]);
    expect(write?.filter((operation) => operation === "insert notifications")).toHaveLength(2);
    expect(write?.filter((operation) => operation === "select station_watches" || operation === "select stations")).toEqual([
      "select stations",
      "select station_watches",
      "select stations",
    ]);
    expect(write?.filter((operation) => operation === "select users")).toEqual(["select users"]);

    const stationsRead = dbMock.calls.find((call) => call.operation === "select" && call.table === "stations");
    const [linkedPermitsRead, listsRead] = dbMock.calls.filter((call) => call.operation === "execute").map(statementOf);
    expect(whereOf(stationsRead).params).toEqual(["[100,101,102]"]);
    expect(linkedPermitsRead?.params).toEqual(['[{"station_id":100,"permit_id":703}]']);
    expect(listsRead?.params).toEqual(["[100,101]"]);
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

  it("tells of the links a relink run corrected, with no site of its own", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(1, "station_linked", { stationId: 100, permitId: 701 }),
      change(2, "station_linked", { stationId: 100, permitId: 702 }),
    ]);
    dbMock.enqueueFor("select", "stations", [storedStation()]);
    dbMock.enqueueFor("execute", undefined, [linkedPermit(701, 501), linkedPermit(702, 501)]);
    scriptRecipients([{ stationId: 100, watchers: [WATCHER] }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(stationNotifications, { run: claimedRun({ kind: "relink" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        stationId: 100,
        metadata: expect.objectContaining({ permits_added: 2, permits_deleted: 0, official_sites_added: 0, count: 2 }),
        actionUrl: "/#map=16.00/52.23/21.01~fu~U501",
      }),
    ]);
  });
});
