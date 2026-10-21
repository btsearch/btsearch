import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  type LinkablePermit,
  type LinkableStation,
  type StationLink,
  correctStationLinks,
  decideStationLinks,
  readOfficialGroupsAfter,
} from "../../../src/features/official/links.js";
import type { DbTx } from "../../../src/types/global.js";
import { type DatabaseCall, dbMock } from "../../helpers/boundaries.js";

const X = { longitude: 21, latitude: 52 };
const W = { longitude: 21.5, latitude: 52.5 };
const Z = { longitude: 22, latitude: 53 };
const NOWHERE = { longitude: null, latitude: null };

const dialect = new PgDialect();
const tx = dbMock as unknown as DbTx;

function permit(permitId: number, officialSiteId: number, place: typeof X, overrides: Partial<LinkablePermit> = {}): LinkablePermit {
  return { permitId, officialSiteId, sourceId: 1, operatorId: 4, siteId: "BT1001", ...place, ...overrides };
}

function station(stationId: number, place: typeof X | typeof NOWHERE, overrides: Partial<LinkableStation> = {}): LinkableStation {
  return { stationId, operatorId: 4, siteId: "BT1001", ...place, ...overrides };
}

function pairs(links: readonly StationLink[]): string[] {
  return links.map(({ stationId, permitId }) => `${stationId}:${permitId}`).sort();
}

function whereOf(call: DatabaseCall | undefined) {
  return dialect.sqlToQuery(call?.clauses.where?.[0] as SQL);
}

function groupsOf(call: DatabaseCall | undefined): unknown {
  return JSON.parse(String(whereOf(call).params[0]));
}

function trace(): string[] {
  return dbMock.calls.map((call) => [call.operation, call.table, call.clauses.for?.[0]].filter(Boolean).join(" "));
}

describe("which permits link to which of our stations", () => {
  it("links a permit to our station with its site id, operator and coordinates", () => {
    expect(decideStationLinks([permit(700, 501, X)], [station(100, X)])).toEqual([{ stationId: 100, permitId: 700 }]);
  });

  it("links by site id and operator alone when that pair has one official site with permits", () => {
    const permits = [permit(700, 501, X), permit(701, 501, X)];

    expect(pairs(decideStationLinks(permits, [station(100, W)]))).toEqual(["100:700", "100:701"]);
    expect(pairs(decideStationLinks(permits, [station(100, NOWHERE)]))).toEqual(["100:700", "100:701"]);
  });

  it("links only the site at our station's coordinates when the pair has several official sites", () => {
    const permits = [permit(700, 501, X), permit(710, 502, Z)];

    expect(pairs(decideStationLinks(permits, [station(100, X)]))).toEqual(["100:700"]);
    expect(decideStationLinks(permits, [station(100, W)])).toEqual([]);
    expect(decideStationLinks(permits, [station(100, NOWHERE)])).toEqual([]);
  });

  it("compares site ids as exact strings and operators as ids", () => {
    const permits = [permit(700, 501, X, { siteId: "0123" }), permit(701, 502, X, { siteId: "bt1001" }), permit(702, 503, X, { operatorId: 5 })];

    expect(decideStationLinks(permits, [station(100, X, { siteId: "123" }), station(101, X)])).toEqual([]);
  });

  it("never links a station without an operator", () => {
    expect(decideStationLinks([permit(700, 501, X)], [station(100, X, { operatorId: null })])).toEqual([]);
  });

  it("links every operator's station at one place to its own permits", () => {
    const permits = [permit(700, 501, X), permit(800, 601, X, { operatorId: 5 })];
    const ourStations = [station(100, X), station(200, X, { operatorId: 5 })];

    expect(pairs(decideStationLinks(permits, ourStations))).toEqual(["100:700", "200:800"]);
  });

  it("counts the official sites of each source on their own", () => {
    const first = [permit(700, 501, X)];
    const second = [permit(900, 801, Z, { sourceId: 2 }), permit(901, 802, W, { sourceId: 2 })];
    const linked = decideStationLinks([...first, ...second], [station(100, W)]);

    expect(pairs(linked)).toEqual(["100:700", "100:901"]);
    expect(pairs(linked.filter(({ permitId }) => permitId < 900))).toEqual(pairs(decideStationLinks(first, [station(100, W)])));
  });
});

describe("correcting the links of a group", () => {
  const group = { operatorId: 4, siteId: "BT1001" };
  const ours = station(100, W);
  let stored = new Map<string, number>();
  let nextLinkId = 9000;

  async function correctTo(permits: readonly LinkablePermit[], expected: { added: StationLink[]; removed: StationLink[] }): Promise<void> {
    dbMock.enqueueStationLinks(
      [{ id: 100 }],
      permits.map((row) => {
        const linkId = stored.get(`100:${row.permitId}`) ?? null;
        return { ...row, linkId, linkedStationId: linkId === null ? null : 100 };
      }),
      [ours],
    );
    if (expected.added.length > 0) dbMock.enqueueFor("insert", "stations_permits", expected.added);
    if (expected.removed.length > 0) dbMock.enqueueFor("delete", "stations_permits", expected.removed);
    const removedIds = expected.removed.map((link) => stored.get(`${link.stationId}:${link.permitId}`));
    const firstCall = dbMock.calls.length;

    expect(await correctStationLinks(tx, [group])).toEqual(expected);

    const written = dbMock.calls.slice(firstCall).filter((call) => call.table === "stations_permits");
    expect(dbMock.pendingResults()).toBe(0);
    expect(written.find((call) => call.operation === "insert")?.values).toEqual(
      expected.added.length > 0 ? expected.added.map(({ stationId, permitId }) => ({ station_id: stationId, permit_id: permitId })) : undefined,
    );
    expect(written.filter((call) => call.operation === "delete").map((call) => whereOf(call).params)).toEqual(
      expected.removed.length > 0 ? [removedIds] : [],
    );

    for (const link of expected.removed) stored.delete(`${link.stationId}:${link.permitId}`);
    for (const link of expected.added) stored.set(`${link.stationId}:${link.permitId}`, (nextLinkId += 1));
    expect([...stored.keys()].sort()).toEqual(pairs(decideStationLinks(permits, [ours])));
  }

  it("follows a group through a second site and a move, each time ending where a full rebuild would", async () => {
    stored = new Map();
    const both = [
      { stationId: 100, permitId: 700 },
      { stationId: 100, permitId: 701 },
    ];
    const firstSite = (place: typeof X) => [permit(700, 501, place), permit(701, 501, place)];
    const secondSite = [permit(710, 502, Z)];

    await correctTo(firstSite(X), { added: both, removed: [] });
    expect([...stored.keys()]).toEqual(["100:700", "100:701"]);

    await correctTo([...firstSite(X), ...secondSite], { added: [], removed: both });
    expect([...stored.keys()]).toEqual([]);

    await correctTo([...firstSite(W), ...secondSite], { added: both, removed: [] });
    expect([...stored.keys()]).toEqual(["100:700", "100:701"]);

    await correctTo([...firstSite(X), ...secondSite], { added: [], removed: both });
    expect([...stored.keys()]).toEqual([]);

    await correctTo(firstSite(X), { added: both, removed: [] });
    expect([...stored.keys()]).toEqual(["100:700", "100:701"]);

    await correctTo(firstSite(X), { added: [], removed: [] });
  });

  it("locks our stations of the groups, in id order, before it reads what it decides on", async () => {
    dbMock.enqueueStationLinks([{ id: 100 }], [{ ...permit(700, 501, X), linkId: null, linkedStationId: null }], [station(100, X)]);
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 100, permitId: 700 }]);

    await correctStationLinks(tx, [group, { operatorId: null, siteId: "BT1001" }, { ...group }, { operatorId: 4, siteId: "BT0999" }]);

    expect(trace()).toEqual(["select stations no key update", "select official.sites", "select stations", "insert stations_permits"]);
    const [lock, permits, ourStations, insert] = dbMock.calls;
    expect(whereOf(lock).sql).toContain('("stations"."station_id", "stations"."operator_id") IN');
    expect(dialect.sqlToQuery(lock?.clauses.orderBy?.[0] as SQL).sql).toBe('"stations"."id" asc');
    expect(whereOf(permits).sql).toContain('("official"."sites"."site_id", "official"."sites"."operator_id") IN');
    expect(whereOf(ourStations).sql).not.toContain("status");
    for (const call of [lock, permits, ourStations]) expect(groupsOf(call)).toEqual([group, { operatorId: 4, siteId: "BT0999" }]);
    expect(insert?.clauses.onConflictDoNothing).toBeUndefined();
  });

  it("removes a pair whose permit sits in the group although its station does not", async () => {
    const remapped = permit(800, 520, X, { operatorId: 7, siteId: "BT2000" });
    dbMock.enqueueStationLinks(
      [{ id: 201 }],
      [{ ...remapped, linkId: 9100, linkedStationId: 200 }],
      [station(201, X, { operatorId: 7, siteId: "BT2000" })],
    );
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 201, permitId: 800 }]);
    dbMock.enqueueFor("delete", "stations_permits", [{ stationId: 200, permitId: 800 }]);

    expect(await correctStationLinks(tx, [{ operatorId: 7, siteId: "BT2000" }])).toEqual({
      added: [{ stationId: 201, permitId: 800 }],
      removed: [{ stationId: 200, permitId: 800 }],
    });
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([9100]);
  });

  it("inserts without a conflict clause, and reports only the pairs its delete really removed", async () => {
    stored = new Map();
    dbMock.enqueueStationLinks(
      [{ id: 100 }],
      [
        { ...permit(700, 501, X), linkId: null, linkedStationId: null },
        { ...permit(702, 501, X), linkId: 9001, linkedStationId: 300 },
        { ...permit(702, 501, X), linkId: 9002, linkedStationId: 100 },
      ],
      [ours],
    );
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 100, permitId: 700 }]);
    dbMock.enqueueFor("delete", "stations_permits", []);

    expect(await correctStationLinks(tx, [group])).toEqual({ added: [{ stationId: 100, permitId: 700 }], removed: [] });
    const insert = dbMock.calls.find((call) => call.operation === "insert");
    expect(insert?.values).toEqual([{ station_id: 100, permit_id: 700 }]);
    expect(Object.keys(insert?.clauses ?? {})).toEqual(["values", "returning"]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete")).params).toEqual([9001]);
  });

  it("fails on a pair that exists after all, instead of passing over it", async () => {
    const conflict = new Error('duplicate key value violates unique constraint "stations_permits_pair_unique"');
    dbMock.enqueueStationLinks([{ id: 100 }], [{ ...permit(700, 501, X), linkId: null, linkedStationId: null }], [ours]);
    dbMock.enqueueFor("insert", "stations_permits", conflict);

    await expect(correctStationLinks(tx, [group])).rejects.toBe(conflict);
  });

  it("locks and reads again when a station it did not lock has entered the group in between", async () => {
    const unlinked = { ...permit(700, 501, X), linkId: null, linkedStationId: null };
    dbMock.enqueueStationLinks([], [unlinked], [ours], [{ id: 100 }], [{ ...unlinked, linkId: 9001, linkedStationId: 100 }], [ours]);

    expect(await correctStationLinks(tx, [group])).toEqual({ added: [], removed: [] });
    expect(trace()).toEqual([
      "select stations no key update",
      "select official.sites",
      "select stations",
      "select stations no key update",
      "select official.sites",
      "select stations",
    ]);
  });

  it("takes no row lock when told not to, and decides on what it reads once", async () => {
    dbMock.enqueueStationLinks([{ ...permit(700, 501, X), linkId: null, linkedStationId: null }], [ours]);
    dbMock.enqueueFor("insert", "stations_permits", [{ stationId: 100, permitId: 700 }]);

    expect(await correctStationLinks(tx, [group], { locksStations: false })).toEqual({ added: [{ stationId: 100, permitId: 700 }], removed: [] });
    expect(trace()).toEqual(["select official.sites", "select stations", "insert stations_permits"]);
  });

  it("stops after the permits when the groups have none, and reads nothing without a group", async () => {
    expect(await correctStationLinks(tx, [{ operatorId: 9, siteId: "FR-1" }])).toEqual({ added: [], removed: [] });
    expect(trace()).toEqual(["select stations no key update", "select official.sites"]);

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
    expect(whereOf(first)).toMatchObject({ sql: '("official"."sites"."site_id" is not null)', params: [] });
    expect(whereOf(second)).toMatchObject({
      sql: '((("official"."sites"."site_id" is not null)) and (("official"."sites"."site_id", "official"."sites"."operator_id") > ($1::text, $2::integer)))',
      params: ["BT0499", 4],
    });
    expect(second?.clauses.orderBy?.map((order) => dialect.sqlToQuery(order as SQL).sql)).toEqual([
      '"official"."sites"."site_id" asc',
      '"official"."sites"."operator_id" asc',
    ]);
  });
});
