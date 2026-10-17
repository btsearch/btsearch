import { beforeEach, describe, expect, it } from "vitest";

import { RunNotOwnedError } from "../../../../../src/features/official/import/runs.js";
import {
  type SiteChangeSummary,
  type StoredSite,
  siteNotificationOf,
  siteNotifications,
  summarizeSiteChanges,
} from "../../../../../src/features/official/import/steps/siteNotifications.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  FOREIGN_TOKEN,
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
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

const WATCHER = "0199d000-0000-7000-8000-0000000000a1";
const LIST_OWNER = "0199d000-0000-7000-8000-0000000000a2";

function summary(overrides: Partial<SiteChangeSummary> = {}): SiteChangeSummary {
  return { officialSiteId: 501, lastSeq: 9, wasAdded: false, permitsAdded: 0, permitsArchived: 0, ...overrides };
}

function storedSite(overrides: Partial<StoredSite> = {}): StoredSite {
  return { id: 501, siteCode: "BT1001", latitude: 52.2297, longitude: 21.0123, hasPermits: true, ...overrides };
}

function scriptRecipients(sites: readonly { siteId: number; watchers?: readonly string[]; listOwners?: readonly string[] }[]): void {
  dbMock.enqueueFor(
    "select",
    "official.site_watches",
    sites.flatMap(({ siteId, watchers = [] }) => watchers.map((userId) => ({ watchedId: siteId, userId }))),
  );
  dbMock.enqueueFor(
    "execute",
    undefined,
    sites.flatMap(({ siteId, listOwners = [] }) => listOwners.map((userId) => ({ watchedId: siteId, userId }))),
  );
  dbMock.enqueueFor(
    "select",
    "official.sites",
    sites.map(({ siteId }) => ({ siteId, operatorName: "Orange", operatorMnc: 26003 })),
  );
  const recipients = [...new Set(sites.flatMap(({ watchers = [], listOwners = [] }) => [...watchers, ...listOwners]))];
  if (recipients.length > 0)
    dbMock.enqueueFor(
      "select",
      "users",
      recipients.map((id) => ({ id, locale: "en-US" })),
    );
}

beforeEach(recordTransactions);

describe("the changes of a run, per official site", () => {
  it("counts the permits added and archived and remembers that the site itself was added", () => {
    const summaries = summarizeSiteChanges([
      change(3, "site_added", { officialSiteId: 503 }),
      change(4, "permit_added", { officialSiteId: 503, permitId: 703 }),
      change(1, "permit_added", { officialSiteId: 501, permitId: 701 }),
      change(2, "permit_added", { officialSiteId: 501, permitId: 702 }),
      change(8, "permit_archived", { officialSiteId: 501, permitId: 650 }),
      change(9, "permit_archived", { officialSiteId: 502, permitId: 651 }),
    ]);

    expect(summaries).toEqual([
      { officialSiteId: 503, lastSeq: 4, wasAdded: true, permitsAdded: 1, permitsArchived: 0 },
      { officialSiteId: 501, lastSeq: 8, wasAdded: false, permitsAdded: 2, permitsArchived: 1 },
      { officialSiteId: 502, lastSeq: 9, wasAdded: false, permitsAdded: 0, permitsArchived: 1 },
    ]);
  });

  it("does not count as added a permit that the same run archived again", () => {
    const [site] = summarizeSiteChanges([
      change(1, "permit_added", { officialSiteId: 501, permitId: 701 }),
      change(5, "permit_archived", { officialSiteId: 501, permitId: 701 }),
    ]);

    expect(site).toMatchObject({ permitsAdded: 0, permitsArchived: 1 });
  });
});

describe("the notification of an official site", () => {
  it.each([
    {
      case: "permits added to a site that was there before",
      summary: summary({ permitsAdded: 2 }),
      site: storedSite(),
      metadata: { permits_added: 2, permits_deleted: 0, official_sites_added: 0, count: 2 },
      siteDeleted: false,
      actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
    },
    {
      case: "a site added with its permits",
      summary: summary({ wasAdded: true, permitsAdded: 3 }),
      site: storedSite(),
      metadata: { permits_added: 3, permits_deleted: 0, official_sites_added: 1, count: 4 },
      siteDeleted: false,
      actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
    },
    {
      case: "a permit archived on a site that keeps others",
      summary: summary({ permitsAdded: 1, permitsArchived: 1 }),
      site: storedSite(),
      metadata: { permits_added: 1, permits_deleted: 1, official_sites_added: 0, count: 2 },
      siteDeleted: false,
      actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
    },
    {
      case: "a site the run left without permits",
      summary: summary({ permitsArchived: 2 }),
      site: storedSite({ hasPermits: false }),
      metadata: { permits_added: 0, permits_deleted: 2, official_sites_added: 0, official_site_deleted: true, count: 2 },
      siteDeleted: true,
      actionUrl: "/#map=16.00/52.2297/21.0123",
    },
    {
      case: "a site added and emptied in one run",
      summary: summary({ wasAdded: true, permitsArchived: 1 }),
      site: storedSite({ hasPermits: false }),
      metadata: { permits_added: 0, permits_deleted: 1, official_sites_added: 0, official_site_deleted: true, count: 1 },
      siteDeleted: true,
      actionUrl: "/#map=16.00/52.2297/21.0123",
    },
  ])("tells of $case", ({ summary: changes, site, metadata, siteDeleted, actionUrl }) => {
    const notification = siteNotificationOf(changes, site);

    expect(notification).toEqual({
      officialSiteId: 501,
      stationStringId: "BT1001",
      type: "station_official_permit_added",
      siteDeleted,
      metadata,
      actionUrl,
    });
    expect(Object.keys(notification?.metadata ?? {})).toEqual(Object.keys(metadata));
  });

  it("is not written when nothing countable changed", () => {
    expect(siteNotificationOf(summary({ wasAdded: true }), storedSite({ hasPermits: false }))).toBeNull();
    expect(siteNotificationOf(summary(), storedSite())).toBeNull();
  });
});

describe("the site notifications step", () => {
  it("notifies the watchers and list owners of each changed site, and saves its progress with the rows it wrote", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(11, "permit_added", { officialSiteId: 501, permitId: 701 }),
      change(12, "permit_added", { officialSiteId: 501, permitId: 702 }),
      change(13, "site_added", { officialSiteId: 503 }),
      change(14, "permit_added", { officialSiteId: 503, permitId: 703 }),
      change(20, "permit_archived", { officialSiteId: 502, permitId: 650 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [
      storedSite(),
      storedSite({ id: 502, siteCode: "BT1002", latitude: 50.1, longitude: 19.9, hasPermits: false }),
      storedSite({ id: 503, siteCode: "BT1003" }),
    ]);
    scriptRecipients([
      { siteId: 501, watchers: [WATCHER], listOwners: [LIST_OWNER, WATCHER] },
      { siteId: 503 },
      { siteId: 502, watchers: [WATCHER] },
    ]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], []);
    dbMock.enqueueFor("select", "notifications", [
      { id: "n-0", metadata: { permits_added: 1, permits_deleted: 0, official_sites_added: 0, count: 1 } },
    ]);
    dbMock.enqueueFor("update", "notifications", [{ id: "n-0" }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-2" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(siteNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    const [start, read, write, finish] = transactionsOf(trace());
    expect(start).toEqual(["select official.import_runs", "select official.import_run_steps", "insert official.import_run_steps", "commit"]);
    expect(read).toEqual(["select official.import_runs", "select official.import_changes", "commit"]);
    expect(write?.slice(0, 2)).toEqual(["select official.import_runs", "select official.sites"]);
    expect(write?.slice(-2)).toEqual(["update official.import_run_steps", "commit"]);
    expect(write?.filter((operation) => /^select official\.site(_watche)?s$/.test(operation))).toEqual([
      "select official.sites",
      "select official.site_watches",
      "select official.sites",
    ]);
    expect(write?.filter((operation) => operation === "select users")).toEqual(["select users"]);
    expect(write?.filter((operation) => operation.endsWith("notifications"))).toEqual([
      "insert notifications",
      "insert notifications",
      "select notifications",
      "update notifications",
      "insert notifications",
    ]);
    expect(finish).toEqual(["select official.import_runs", "update official.import_run_steps", "commit"]);

    const sitesRead = dbMock.calls.find((call) => call.operation === "select" && call.table === "official.sites");
    const [listsRead] = dbMock.calls.filter((call) => call.operation === "execute").map(statementOf);
    expect(whereOf(sitesRead).params).toEqual(["[501,503,502]"]);
    expect(listsRead?.params).toEqual(["[501,503,502]"]);
    const inserted = valuesOf("insert", "notifications") as Record<string, unknown>[];
    const addressed = inserted.map(({ userId, officialSiteId, stationId, type, title, actionUrl }) => ({
      userId,
      officialSiteId,
      stationId,
      type,
      title,
      actionUrl,
    }));
    expect(addressed).toEqual([
      {
        userId: WATCHER,
        officialSiteId: 501,
        stationId: null,
        type: "station_official_permit_added",
        title: "Station permits changed",
        actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
      },
      {
        userId: LIST_OWNER,
        officialSiteId: 501,
        stationId: null,
        type: "station_official_permit_added",
        title: "Station permits changed",
        actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
      },
      {
        userId: WATCHER,
        officialSiteId: null,
        stationId: null,
        type: "station_official_permit_added",
        title: "Station permits changed",
        actionUrl: "/#map=16.00/50.1/19.9",
      },
    ]);
    expect(inserted[0]?.metadata).toEqual({
      station_id: "BT1001",
      station_operator_name: "Orange",
      station_operator_mnc: 26003,
      permits_added: 2,
      permits_deleted: 0,
      official_sites_added: 0,
      count: 2,
    });
    expect(inserted[2]?.metadata).toMatchObject({ station_id: "BT1002", permits_deleted: 1, official_site_deleted: true, count: 1 });
    expect(inserted.every((row) => row.pushQueuedAt instanceof Date)).toBe(true);
    expect(valuesOf("update", "notifications")).toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ permits_added: 3, count: 3 }), pushSentAt: null }),
    ]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ lastSeq: 20 });
  });

  it("fails, and saves no progress, when a notification cannot be written", async () => {
    scriptStepStart();
    ownRun(3);
    dbMock.enqueueFor("select", "official.import_changes", [change(11, "permit_added", { officialSiteId: 501, permitId: 701 })]);
    dbMock.enqueueFor("select", "official.sites", [storedSite()]);
    scriptRecipients([{ siteId: 501, watchers: [WATCHER] }]);
    dbMock.enqueueFor("insert", "notifications", new Error("connection lost"));
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);

    await expect(runStep(siteNotifications)).rejects.toThrow("After-step site_notifications failed: connection lost");

    const operations = trace();
    expect(operations.filter((operation) => operation === "rollback")).toHaveLength(1);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ error: "connection lost" }]);
  });

  it("repeats a page that lost a deadlock, and keeps its rows and its progress once", async () => {
    scriptStepStart();
    ownRun(3);
    dbMock.enqueueFor("select", "official.import_changes", [change(11, "permit_added", { officialSiteId: 501, permitId: 701 })]);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      dbMock.enqueueFor("select", "official.sites", [storedSite()]);
      scriptRecipients([{ siteId: 501, watchers: [WATCHER] }]);
    }
    dbMock.enqueueFor("insert", "notifications", lostDeadlock(), [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(siteNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    const [, , lost, repeated] = transactionsOf(trace());
    expect(lost?.slice(-2)).toEqual(["insert notifications", "rollback"]);
    expect(repeated?.slice(-3)).toEqual(["insert notifications", "update official.import_run_steps", "commit"]);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ lastSeq: 11 }, expect.objectContaining({ finishedAt: expect.anything() })]);
  });

  it("resumes after a takeover with the sites it had not handled, and repeats none", async () => {
    const changes = Array.from({ length: 201 }, (_, index) =>
      change(index + 1, "permit_added", { officialSiteId: 1000 + index, permitId: 5000 + index }),
    );
    const sites = changes.map(({ officialSiteId }) => storedSite({ id: officialSiteId ?? 0, siteCode: `S${officialSiteId}` }));
    const scriptSites = (rows: readonly StoredSite[]) => {
      dbMock.enqueueFor("select", "official.sites", [...rows]);
      scriptRecipients(rows.map(({ id }) => ({ siteId: id, watchers: id === 1000 || id === 1200 ? [WATCHER] : [] })));
    };

    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", changes);
    scriptSites(sites.slice(0, 200));
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    ownRun(1, FOREIGN_TOKEN);

    await expect(runStep(siteNotifications)).rejects.toBeInstanceOf(RunNotOwnedError);

    expect(dbMock.pendingResults()).toBe(0);
    expect(valuesOf("update", "official.import_run_steps")).toEqual([{ lastSeq: 200 }]);
    expect((valuesOf("insert", "notifications") as { officialSiteId: number }[]).map((row) => row.officialSiteId)).toEqual([1000]);
    const firstAttempt = dbMock.calls.length;

    scriptStepStart({ lastSeq: 200 });
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", changes);
    scriptSites(sites.slice(200));
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-2" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(siteNotifications, { run: claimedRun({ attempt: 2 }) });

    expect(dbMock.pendingResults()).toBe(0);
    const resumed = dbMock.calls.slice(firstAttempt);
    expect(whereOf(resumed.find((call) => call.operation === "select" && call.table === "official.sites")).params).toEqual(["[1200]"]);
    expect(resumed.filter((call) => call.operation === "insert" && call.table === "notifications").map((call) => call.values)).toEqual([
      expect.objectContaining({ officialSiteId: 1200 }),
    ]);
    expect(resumed.filter((call) => call.table === "official.import_run_steps" && call.operation === "update").map((call) => call.values)).toEqual([
      { error: null },
      { lastSeq: 201 },
      expect.anything(),
    ]);
  });

  it("tells of a remap run's archived permits as of an import's, and of nothing for a site that was only remapped", async () => {
    scriptStepStart();
    ownRun(2);
    dbMock.enqueueFor("select", "official.import_changes", [
      change(8, "permit_archived", { officialSiteId: 502, permitId: 650 }),
      change(9, "permit_archived", { officialSiteId: 509, permitId: 651 }),
    ]);
    dbMock.enqueueFor("select", "official.sites", [storedSite({ id: 502, siteCode: "BT1002", hasPermits: false })]);
    scriptRecipients([{ siteId: 502, watchers: [WATCHER] }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptStepFinish();

    await runStep(siteNotifications, { run: claimedRun({ kind: "remap" }) });

    expect(dbMock.pendingResults()).toBe(0);
    expect(whereOf(dbMock.calls.find((call) => call.table === "official.import_changes")).params).toEqual([
      RUN_ID,
      "site_added",
      "permit_added",
      "permit_archived",
    ]);
    expect(valuesOf("insert", "notifications")).toEqual([
      expect.objectContaining({
        officialSiteId: null,
        metadata: expect.objectContaining({ station_id: "BT1002", permits_deleted: 1, official_site_deleted: true, count: 1 }),
      }),
    ]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ lastSeq: 9 });
  });

  it("writes nothing when the run changed no site", async () => {
    scriptStepStart();
    ownRun(1);
    dbMock.enqueueFor("select", "official.import_changes", []);
    scriptStepFinish();

    await runStep(siteNotifications);

    expect(dbMock.pendingResults()).toBe(0);
    expect(dbMock.calls.some((call) => call.operation === "execute" || call.table === "official.sites" || call.table === "notifications")).toBe(
      false,
    );
  });
});
