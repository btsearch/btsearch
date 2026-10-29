import { describe, expect, it, vi } from "vitest";

import { coalesceOrCreateStationNotification } from "../../../src/features/notifications/coalesceOrCreateStationNotification.js";
import { notifyOfficialSitesWatchers, notifyStationWatchers, notifyStationsWatchers } from "../../../src/features/notifications/service.js";
import { getOfficialSitesWatchers, getStationWatchers, getStationsWatchers } from "../../../src/features/notifications/watchers.js";
import type { DbTx } from "../../../src/types/global.js";
import { dbMock } from "../../helpers/boundaries.js";
import { statementOf } from "../../helpers/importEngineFixtures.js";

const FIRST = "0199d000-0000-7000-8000-0000000000a1";
const SECOND = "0199d000-0000-7000-8000-0000000000a2";
const SITE_CHANGE = {
  officialSiteId: 501,
  stationStringId: "BT1001",
  type: "station_official_permit_added" as const,
  metadata: { permits_added: 1, permits_deleted: 0, official_sites_added: 0, count: 1 },
  actionUrl: "/#map=16.00/52.2297/21.0123~fu~U501",
};
const STATION_CHANGE = { stationId: 100, stationStringId: "BT1001", type: "station_official_permit_added" as const, metadata: { count: 1 } };

function transaction() {
  const tx = { select: vi.fn(dbMock.select), insert: vi.fn(dbMock.insert), update: vi.fn(dbMock.update), execute: vi.fn(dbMock.execute) };
  return { tx, asTx: tx as unknown as DbTx };
}

function scriptSiteRecipients(userIds: readonly string[]): void {
  dbMock.enqueueFor(
    "select",
    "official.site_watches",
    userIds.map((userId) => ({ watchedId: 501, userId })),
  );
  dbMock.enqueueFor("execute", undefined, []);
  dbMock.enqueueFor("select", "official.sites", [{ siteId: 501, operatorName: "Orange", operatorMnc: 26003 }]);
  dbMock.enqueueFor(
    "select",
    "users",
    userIds.map((id) => ({ id, locale: "en-US" })),
  );
}

function insertedUserIds(): unknown[] {
  return dbMock.calls.filter((call) => call.operation === "insert").map((call) => (call.values as { userId: string }).userId);
}

describe("the watchers of a station or an official site", () => {
  it("are the direct watchers and the owners of notifying lists that hold it, each once", async () => {
    dbMock.enqueueFor("select", "station_watches", [{ userId: SECOND }]);
    dbMock.enqueueFor("select", "user_lists", [{ userId: SECOND }]);

    expect(await getStationWatchers(100)).toEqual([SECOND]);
  });

  it("are read for a page of official sites at once: direct watchers first, then the owners of notifying lists, each once", async () => {
    const { asTx } = transaction();
    dbMock.enqueueFor("select", "official.site_watches", [
      { watchedId: 501, userId: FIRST },
      { watchedId: 502, userId: SECOND },
    ]);
    dbMock.enqueueFor("execute", undefined, [
      { watchedId: 501, userId: SECOND },
      { watchedId: 501, userId: FIRST },
    ]);

    expect(await getOfficialSitesWatchers([501, 502, 503], asTx)).toEqual(
      new Map([
        [501, [FIRST, SECOND]],
        [502, [SECOND]],
      ]),
    );
    expect(statementOf(dbMock.calls.find((call) => call.operation === "execute")).params).toEqual([[501, 502, 503]]);
  });

  it("are read for a page of our stations: direct watchers first, then the owners of notifying lists", async () => {
    const { asTx } = transaction();
    dbMock.enqueueFor("select", "station_watches", [{ watchedId: 101, userId: FIRST }]);
    dbMock.enqueueFor("execute", undefined, [{ watchedId: 100, userId: SECOND }]);

    expect(await getStationsWatchers([100, 101], asTx)).toEqual(
      new Map([
        [101, [FIRST]],
        [100, [SECOND]],
      ]),
    );
  });
});

describe("a watcher notification outside a transaction", () => {
  it("goes on with the other recipients when one write fails, as before", async () => {
    dbMock.enqueueFor("select", "station_watches", [{ userId: FIRST }, { userId: SECOND }]);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", [{ operatorName: "Play", operatorMnc: 26006 }]);
    dbMock.enqueueFor("select", "users", [
      { id: FIRST, locale: "en-US" },
      { id: SECOND, locale: "en-US" },
    ]);
    dbMock.enqueueFor("insert", "notifications", new Error("connection lost"), [{ id: "n-2" }]);

    await expect(notifyStationWatchers(STATION_CHANGE)).resolves.toBeUndefined();

    expect(insertedUserIds()).toEqual([FIRST, SECOND]);
  });
});

describe("a watcher notification inside a transaction", () => {
  it("reads the recipients and writes every row through that transaction", async () => {
    const { tx, asTx } = transaction();
    scriptSiteRecipients([FIRST, SECOND]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], []);
    dbMock.enqueueFor("select", "notifications", [{ id: "n-0", metadata: { permits_added: 2, count: 2 } }]);
    dbMock.enqueueFor("update", "notifications", [{ id: "n-0" }]);

    await notifyOfficialSitesWatchers([SITE_CHANGE], asTx);

    expect(dbMock.pendingResults()).toBe(0);
    expect(tx.select).toHaveBeenCalledTimes(4);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(dbMock.select).toHaveBeenCalledTimes(4);
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({
      metadata: { permits_added: 3, permits_deleted: 0, official_sites_added: 0, count: 3 },
    });
  });

  it("fails on the first write that fails and writes for nobody after it", async () => {
    const { asTx } = transaction();
    scriptSiteRecipients([FIRST, SECOND]);
    dbMock.enqueueFor("insert", "notifications", new Error("connection lost"));

    await expect(notifyOfficialSitesWatchers([SITE_CHANGE], asTx)).rejects.toThrow("connection lost");

    expect(insertedUserIds()).toEqual([FIRST]);
  });

  it("writes the notification of a removed site without the site, so that the site's delete does not take it along", async () => {
    const { asTx } = transaction();
    scriptSiteRecipients([FIRST]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);

    await notifyOfficialSitesWatchers([{ ...SITE_CHANGE, siteDeleted: true }], asTx);

    const inserted = dbMock.calls.find((call) => call.operation === "insert");
    expect(inserted?.values).toMatchObject({ userId: FIRST, officialSiteId: null, stationId: null });
    expect(inserted?.clauses.onConflictDoNothing).toBeUndefined();
  });
});

describe("the watcher notifications of a page", () => {
  it("read the watchers, their locales and the operators of every official site once, and write only for the watched ones", async () => {
    const { tx, asTx } = transaction();
    dbMock.enqueueFor("select", "official.site_watches", [{ watchedId: 502, userId: FIRST }]);
    dbMock.enqueueFor("execute", undefined, [{ watchedId: 503, userId: SECOND }]);
    dbMock.enqueueFor("select", "official.sites", [
      { siteId: 502, operatorName: "Orange", operatorMnc: 26003 },
      { siteId: 503, operatorName: "Play", operatorMnc: 26006 },
    ]);
    dbMock.enqueueFor("select", "users", [
      { id: FIRST, locale: "en-US" },
      { id: SECOND, locale: "en-US" },
    ]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }], [{ id: "n-2" }]);

    await notifyOfficialSitesWatchers(
      [
        SITE_CHANGE,
        { ...SITE_CHANGE, officialSiteId: 502, stationStringId: "BT1002" },
        { ...SITE_CHANGE, officialSiteId: 503, stationStringId: "BT1003" },
      ],
      asTx,
    );

    expect(dbMock.pendingResults()).toBe(0);
    expect(tx.select).toHaveBeenCalledTimes(3);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMock.calls.filter((call) => call.table === "users")).toHaveLength(1);
    expect(dbMock.calls.filter((call) => call.operation === "insert").map((call) => call.values)).toEqual([
      expect.objectContaining({
        userId: FIRST,
        officialSiteId: 502,
        metadata: expect.objectContaining({ station_id: "BT1002", station_operator_name: "Orange" }),
      }),
      expect.objectContaining({
        userId: SECOND,
        officialSiteId: 503,
        metadata: expect.objectContaining({ station_id: "BT1003", station_operator_name: "Play" }),
      }),
    ]);
  });

  it("read the watchers and operators of every one of our stations once", async () => {
    const { tx, asTx } = transaction();
    dbMock.enqueueFor("select", "station_watches", [{ watchedId: 101, userId: FIRST }]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "stations", [{ stationId: 101, operatorName: "Play", operatorMnc: 26006 }]);
    dbMock.enqueueFor("select", "users", [{ id: FIRST, locale: null }]);
    dbMock.enqueueFor("insert", "notifications", [{ id: "n-1" }]);

    await notifyStationsWatchers([STATION_CHANGE, { ...STATION_CHANGE, stationId: 101, stationStringId: "BT1002" }], asTx);

    expect(dbMock.pendingResults()).toBe(0);
    expect(tx.select).toHaveBeenCalledTimes(3);
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(dbMock.calls.find((call) => call.operation === "insert")?.values).toMatchObject({
      userId: FIRST,
      stationId: 101,
      metadata: { station_id: "BT1002", station_operator_name: "Play", station_operator_mnc: 26006, count: 1 },
    });
  });
});

describe("the coalescing write", () => {
  it("retries once when the unread row it meant to merge into was read in between, then fails", async () => {
    const { asTx } = transaction();
    dbMock.enqueueFor("insert", "notifications", [], []);
    dbMock.enqueueFor("select", "notifications", [], []);

    await expect(
      coalesceOrCreateStationNotification(
        { userId: FIRST, officialSiteId: 501, type: "station_official_permit_added", title: "UKE permits changed" },
        asTx,
      ),
    ).rejects.toThrow("Failed to create station notification");

    expect(dbMock.calls.map((call) => call.operation)).toEqual(["insert", "select", "insert", "select"]);
  });
});
