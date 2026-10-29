import { officialSites, stations } from "@openbts/drizzle";
import { type SQL, asc } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { type LinkableSite, type LinkableStation, type StationLink, decideStationLinks } from "../../../src/features/official/linkRule.js";
import { type StationLinkChanges, correctStationLinks, readOfficialGroupsAfter } from "../../../src/features/official/links.js";
import type { DbTx } from "../../../src/types/global.js";
import { type DatabaseCall, dbMock } from "../../helpers/boundaries.js";

const X = { longitude: 21, latitude: 52 };
const W = { longitude: 21.5, latitude: 52.5 };
const Z = { longitude: 22, latitude: 53 };
const NOWHERE = { longitude: null, latitude: null };

const dialect = new PgDialect();
const tx = dbMock as unknown as DbTx;

function site(officialSiteId: number, place: typeof X, overrides: Partial<LinkableSite> = {}): LinkableSite {
  return { officialSiteId, sourceId: 1, operatorId: 4, siteId: "BT1001", ...place, ...overrides };
}

function station(stationId: number, place: typeof X | typeof NOWHERE, overrides: Partial<LinkableStation> = {}): LinkableStation {
  return { stationId, operatorId: 4, siteId: "BT1001", ...place, ...overrides };
}

function linkKey({ stationId, officialSiteId }: StationLink): string {
  return `${stationId}:${officialSiteId}`;
}

function pairs(links: readonly StationLink[]): string[] {
  return links.map(linkKey).sort();
}

function whereOf(call: DatabaseCall | undefined) {
  return dialect.sqlToQuery(call?.clauses.where?.[0] as SQL);
}

function groupsOf(call: DatabaseCall | undefined): unknown {
  return whereOf(call).params[0];
}

function trace(): string[] {
  return dbMock.calls.map((call) => [call.operation, call.table, call.clauses.for?.[0]].filter(Boolean).join(" "));
}

describe("which official site links to which of our stations", () => {
  it("links our station to the site with its site id, operator and coordinates", () => {
    expect(decideStationLinks([site(501, X)], [station(100, X)])).toEqual([{ stationId: 100, officialSiteId: 501 }]);
  });

  it("links by site id and operator alone when that pair has one official site with permits", () => {
    expect(pairs(decideStationLinks([site(501, X)], [station(100, W)]))).toEqual(["100:501"]);
    expect(pairs(decideStationLinks([site(501, X)], [station(100, NOWHERE)]))).toEqual(["100:501"]);
  });

  it("links only the site at our station's coordinates when the pair has several official sites", () => {
    const sites = [site(501, X), site(502, Z)];

    expect(pairs(decideStationLinks(sites, [station(100, X)]))).toEqual(["100:501"]);
    expect(decideStationLinks(sites, [station(100, W)])).toEqual([]);
    expect(decideStationLinks(sites, [station(100, NOWHERE)])).toEqual([]);
  });

  it("links the one of several qualifying sites at our station's coordinates, and none when neither or both are there", () => {
    const onlySiteOfEachSource = [site(501, X), site(801, Z, { sourceId: 2 })];

    expect(decideStationLinks(onlySiteOfEachSource, [station(100, X)])).toEqual([{ stationId: 100, officialSiteId: 501 }]);
    expect(decideStationLinks(onlySiteOfEachSource, [station(100, W)])).toEqual([]);
    expect(decideStationLinks(onlySiteOfEachSource, [station(100, NOWHERE)])).toEqual([]);
    expect(decideStationLinks([site(501, X), site(801, X, { sourceId: 2 })], [station(100, X)])).toEqual([]);
    expect(decideStationLinks([site(501, X), site(502, X)], [station(100, X)])).toEqual([]);
  });

  it("compares site ids as exact strings and operators as ids", () => {
    const sites = [site(501, X, { siteId: "0123" }), site(502, X, { siteId: "bt1001" }), site(503, X, { operatorId: 5 })];

    expect(decideStationLinks(sites, [station(100, X, { siteId: "123" }), station(101, X)])).toEqual([]);
  });

  it("never links a station without an operator", () => {
    expect(decideStationLinks([site(501, X)], [station(100, X, { operatorId: null })])).toEqual([]);
  });

  it("links every operator's station at one place to its own site", () => {
    const sites = [site(501, X), site(601, X, { operatorId: 5 })];
    const ourStations = [station(100, X), station(200, X, { operatorId: 5 })];

    expect(pairs(decideStationLinks(sites, ourStations))).toEqual(["100:501", "200:601"]);
  });

  it("counts the official sites of each source on their own", () => {
    const sites = [site(501, X), site(801, Z, { sourceId: 2 }), site(802, W, { sourceId: 2 })];

    expect(decideStationLinks(sites, [station(100, NOWHERE)])).toEqual([{ stationId: 100, officialSiteId: 501 }]);
  });
});

describe("correcting the links of a group", () => {
  const group = { operatorId: 4, siteId: "BT1001" };
  const ours = station(100, W);
  let stored: StationLink[] = [];

  async function correctTo(sites: readonly LinkableSite[], expected: StationLinkChanges): Promise<void> {
    dbMock.enqueueStationLinks([{ id: 100 }], sites, [ours], stored);
    if (expected.removed.length > 0) dbMock.enqueueFor("delete", "stations_official_sites", expected.removed);
    if (expected.added.length > 0) dbMock.enqueueFor("insert", "stations_official_sites", expected.added);
    const firstCall = dbMock.calls.length;

    expect(await correctStationLinks(tx, [group])).toEqual(expected);

    const written = dbMock.calls.slice(firstCall).filter((call) => call.table === "stations_official_sites" && call.operation !== "select");
    expect(dbMock.pendingResults()).toBe(0);
    expect(written.map((call) => call.operation)).toEqual([
      ...(expected.removed.length > 0 ? ["delete"] : []),
      ...(expected.added.length > 0 ? ["insert"] : []),
    ]);
    expect(written.find((call) => call.operation === "insert")?.values).toEqual(
      expected.added.length > 0
        ? expected.added.map(({ stationId, officialSiteId }) => ({ station_id: stationId, official_site_id: officialSiteId }))
        : undefined,
    );
    expect(written.filter((call) => call.operation === "delete").map((call) => whereOf(call).params)).toEqual(
      expected.removed.length > 0
        ? [[...expected.removed.map((link) => link.stationId), ...expected.removed.map((link) => link.officialSiteId)]]
        : [],
    );

    const removedKeys = new Set(expected.removed.map(linkKey));
    stored = [...stored.filter((link) => !removedKeys.has(linkKey(link))), ...expected.added];
    expect(pairs(stored)).toEqual(pairs(decideStationLinks(sites, [ours])));
  }

  it("follows a group through a second site and a move, each time ending where a full rebuild would", async () => {
    stored = [];
    const first = [{ stationId: 100, officialSiteId: 501 }];
    const second = [{ stationId: 100, officialSiteId: 502 }];

    await correctTo([site(501, X)], { added: first, removed: [] });
    expect(pairs(stored)).toEqual(["100:501"]);

    await correctTo([site(501, X), site(502, Z)], { added: [], removed: first });
    expect(stored).toEqual([]);

    await correctTo([site(501, W), site(502, Z)], { added: first, removed: [] });
    expect(pairs(stored)).toEqual(["100:501"]);

    await correctTo([site(501, X), site(502, W)], { added: second, removed: first });
    expect(pairs(stored)).toEqual(["100:502"]);

    await correctTo([site(501, X)], { added: first, removed: second });
    expect(pairs(stored)).toEqual(["100:501"]);

    await correctTo([site(501, X)], { added: [], removed: [] });
  });

  it("locks our stations of the groups, in id order, before it reads what it decides on", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [site(501, X)], [station(100, X)], []);
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);

    await correctStationLinks(tx, [group, { operatorId: null, siteId: "BT1001" }, { ...group }, { operatorId: 4, siteId: "BT0999" }]);

    expect(trace()).toEqual([
      "select stations no key update",
      "select official.sites",
      "select stations",
      "select stations_official_sites",
      "insert stations_official_sites",
    ]);
    const [lock, sites, ourStations, , insert] = dbMock.calls;
    expect(lock?.clauses.orderBy).toEqual([asc(stations.id)]);
    for (const call of [lock, sites, ourStations]) expect(groupsOf(call)).toEqual([group, { operatorId: 4, siteId: "BT0999" }]);
    expect(insert?.clauses.onConflictDoNothing).toBeUndefined();
  });

  it("reads the stored links of our stations in the groups and of the official sites in them", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [site(501, X)], [station(100, X)], [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [group])).toEqual({ added: [], removed: [] });

    const stored = whereOf(dbMock.calls.find((call) => call.table === "stations_official_sites"));
    expect(stored.params).toEqual([[group], [group]]);
  });

  it("removes a link whose site sits in the group although its station does not", async () => {
    const remapped = site(520, X, { operatorId: 7, siteId: "BT2000" });
    dbMock.enqueueStationLinks(
      [{ id: 201 }],
      [remapped],
      [station(201, X, { operatorId: 7, siteId: "BT2000" })],
      [{ stationId: 200, officialSiteId: 520 }],
    );
    dbMock.enqueueFor("delete", "stations_official_sites", [{ stationId: 200, officialSiteId: 520 }]);
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 201, officialSiteId: 520 }]);

    expect(await correctStationLinks(tx, [{ operatorId: 7, siteId: "BT2000" }])).toEqual({
      added: [{ stationId: 201, officialSiteId: 520 }],
      removed: [{ stationId: 200, officialSiteId: 520 }],
    });
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([200, 520]);
    expect(trace().slice(-2)).toEqual(["delete stations_official_sites", "insert stations_official_sites"]);
  });

  it("removes a link of our station to a site outside its group", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [site(501, X)], [station(100, X)], [{ stationId: 100, officialSiteId: 900 }]);
    dbMock.enqueueFor("delete", "stations_official_sites", [{ stationId: 100, officialSiteId: 900 }]);
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [group])).toEqual({
      added: [{ stationId: 100, officialSiteId: 501 }],
      removed: [{ stationId: 100, officialSiteId: 900 }],
    });
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([100, 900]);
  });

  it("inserts without a conflict clause, and reports only the links its delete really removed", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [site(501, X)], [ours], [{ stationId: 300, officialSiteId: 501 }]);
    dbMock.enqueueFor("delete", "stations_official_sites", []);
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [group])).toEqual({ added: [{ stationId: 100, officialSiteId: 501 }], removed: [] });
    const insert = dbMock.calls.find((call) => call.operation === "insert");
    expect(insert?.values).toEqual([{ station_id: 100, official_site_id: 501 }]);
    expect(Object.keys(insert?.clauses ?? {})).toEqual(["values", "returning"]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([300, 501]);
  });

  it("fails on a link that exists after all, instead of passing over it", async () => {
    const conflict = new Error('duplicate key value violates unique constraint "stations_official_sites_site_unique"');
    dbMock.enqueueStationLinks([{ id: 100 }], [site(501, X)], [ours], []);
    dbMock.enqueueFor("insert", "stations_official_sites", conflict);

    await expect(correctStationLinks(tx, [group])).rejects.toBe(conflict);
  });

  it("locks and reads again when a station it did not lock has entered the group in between", async () => {
    dbMock.enqueueStationLinks([], [site(501, X)], [ours], [{ id: 100 }], [site(501, X)], [ours], [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [group])).toEqual({ added: [], removed: [] });
    expect(trace()).toEqual([
      "select stations no key update",
      "select official.sites",
      "select stations",
      "select stations no key update",
      "select official.sites",
      "select stations",
      "select stations_official_sites",
    ]);
  });

  it("takes no row lock when told not to, and decides on what it reads once", async () => {
    dbMock.enqueueStationLinks([site(501, X)], [ours], []);
    dbMock.enqueueFor("insert", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [group], { locksStations: false })).toEqual({
      added: [{ stationId: 100, officialSiteId: 501 }],
      removed: [],
    });
    expect(trace()).toEqual(["select official.sites", "select stations", "select stations_official_sites", "insert stations_official_sites"]);
  });

  it("reads no station when the groups have no site with permits, still removing the links stored there, and reads nothing without a group", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [], [{ stationId: 100, officialSiteId: 501 }]);
    dbMock.enqueueFor("delete", "stations_official_sites", [{ stationId: 100, officialSiteId: 501 }]);

    expect(await correctStationLinks(tx, [{ operatorId: 9, siteId: "FR-1" }])).toEqual({
      added: [],
      removed: [{ stationId: 100, officialSiteId: 501 }],
    });
    expect(trace()).toEqual([
      "select stations no key update",
      "select official.sites",
      "select stations_official_sites",
      "delete stations_official_sites",
    ]);

    dbMock.calls.length = 0;
    expect(await correctStationLinks(tx, [])).toEqual({ added: [], removed: [] });
    expect(await correctStationLinks(tx, [{ operatorId: null, siteId: "BT1001" }])).toEqual({ added: [], removed: [] });
    expect(dbMock.calls).toEqual([]);
  });
});

describe("every group of the official sites", () => {
  it("is read a page at a time, each page after the last group of the one before", async () => {
    const firstPage = Array.from({ length: 500 }, (_unused, index) => ({ siteId: `BT${String(index).padStart(4, "0")}`, operatorId: 4 }));
    dbMock.enqueueFor("select", "official.sites", firstPage, [{ siteId: "BT0500", operatorId: 5 }]);

    expect(await readOfficialGroupsAfter(tx, undefined)).toBe(firstPage);
    expect(await readOfficialGroupsAfter(tx, firstPage.at(-1))).toEqual([{ siteId: "BT0500", operatorId: 5 }]);

    const [first, second] = dbMock.calls;
    expect([first?.clauses.limit, second?.clauses.limit]).toEqual([[500], [500]]);
    expect(whereOf(first).params).toEqual([]);
    expect(whereOf(second).params).toEqual(["BT0499", 4]);
    expect(second?.clauses.orderBy).toEqual([asc(officialSites.station_id), asc(officialSites.operator_id)]);
  });
});
