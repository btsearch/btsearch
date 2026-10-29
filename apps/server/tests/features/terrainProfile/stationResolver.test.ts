import { officialSites } from "@openbts/drizzle";
import { type SQL, getTableUniqueName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { resolveSharedSibling, resolveTerrainStation } from "../../../src/features/terrainProfile/stationResolver.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";
import { cacheCountryVisibility, cacheSourceVisibility } from "../../helpers/officialDataFixtures.js";

const dialect = new PgDialect();
const officialSitesTable = getTableUniqueName(officialSites);

type RawFilter = { RAW: (table: unknown) => SQL };

function storedStation(input: unknown) {
  const { id } = (input as { where: { id: number } }).where;
  return {
    id,
    station_id: `S${id}`,
    operator_id: id === 12 ? 8 : 9,
    location: { id: 2, latitude: 52, longitude: 21, region: { countryCode: "PL" } },
    operator: null,
    permits: [],
  };
}

const labelledPermit = {
  id: 41,
  decision_number: "UKE/123/2026",
  rat: "LTE",
  label_mhz: 800,
  label_variant: "commercial",
  sectors: [{ id: 51, azimuth: 120, antenna_height: 32.5 }],
};

const labelledCandidate = {
  key: expect.stringMatching(/^permit-/),
  source: "permit_fallback",
  antenna: { mountedHeight: 32.5, azimuth: 120 },
  frequencyMHz: 800,
  measuredTilt: null,
  band: { value: 800, rat: "LTE", variant: "commercial" },
  provenance: { report_url: null, report_date: null, permit_id: 41, decision_number: "UKE/123/2026" },
};

function scriptPublicSources() {
  cacheCountryVisibility(["XX"]);
  cacheSourceVisibility([1]);
}

function rawFilter(filter: unknown, table: unknown) {
  const { sql, params } = dialect.sqlToQuery((filter as RawFilter).RAW(table));
  return { sql: sql.replace(/\s+/g, " "), params };
}

function lookups(table: string) {
  return dbMock.calls.filter((call) => call.table === table);
}

describe("resolveTerrainStation", () => {
  it("resolves an official site only while its source and its country are visible to the public", async () => {
    scriptPublicSources();
    dbMock.query.officialSites.findFirst.mockImplementation(async (input) => storedStation(input));

    expect((await resolveTerrainStation({ source: "official", id: 12 })).station.id).toBe(12);
    const [input] = dbMock.query.officialSites.findFirst.mock.calls[0] ?? [];
    expect(input).toMatchObject({ where: { id: 12 } });
    const condition = rawFilter((input as { where: unknown }).where, officialSites);
    expect(condition.sql).toContain('"public_location"."source_id" in');
    expect(condition.params).toEqual([1, "XX"]);
  });

  it("answers 404 for an official site the filter leaves out", async () => {
    scriptPublicSources();
    dbMock.query.officialSites.findFirst.mockResolvedValue(undefined);

    await expect(resolveTerrainStation({ source: "official", id: 12 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("takes the permit heights of one of our stations only from its linked site of a public source", async () => {
    scriptPublicSources();
    dbMock.query.stations.findFirst.mockImplementation(async (input) => storedStation(input));
    dbMock.query.stationsOfficialSites.findFirst.mockResolvedValue(undefined);

    const { permitCandidates } = await resolveTerrainStation({ source: "internal", id: 12 });
    const [input] = dbMock.query.stationsOfficialSites.findFirst.mock.calls[0] ?? [];
    expect(permitCandidates).toEqual([]);
    expect(input).toMatchObject({ where: { station_id: 12 } });
    const condition = rawFilter((input as { where: { officialSite: unknown } }).where.officialSite, officialSites);
    expect(condition.sql).toContain('"public_location"."id" = "official"."sites"."location_id"');
    expect(condition.sql).toContain('"public_location"."source_id" in');
    expect(condition.params).toEqual([1, "XX"]);
  });

  it("takes the frequency and the band of an official site's permit antennas from the permit's label", async () => {
    scriptPublicSources();
    dbMock.query.officialSites.findFirst.mockImplementation(async (input) => ({ ...storedStation(input), permits: [labelledPermit] }));

    const { permitCandidates } = await resolveTerrainStation({ source: "official", id: 12 });

    const [input] = dbMock.query.officialSites.findFirst.mock.calls[0] ?? [];
    expect((input as { with: { permits: unknown } }).with.permits).toEqual({ with: { sectors: true } });
    expect(permitCandidates).toEqual([labelledCandidate]);
  });

  it("takes the frequency and the band of our station's permit antennas from the permit's label", async () => {
    scriptPublicSources();
    dbMock.query.stations.findFirst.mockImplementation(async (input) => storedStation(input));
    dbMock.query.stationsOfficialSites.findFirst.mockResolvedValue({ officialSite: { permits: [labelledPermit] } });

    const { permitCandidates } = await resolveTerrainStation({ source: "internal", id: 12 });

    const [input] = dbMock.query.stationsOfficialSites.findFirst.mock.calls[0] ?? [];
    expect((input as { with: { officialSite: unknown } }).with.officialSite).toEqual({ with: { permits: { with: { sectors: true } } } });
    expect(permitCandidates).toEqual([labelledCandidate]);
  });
});

describe("resolveSharedSibling", () => {
  it.each([
    { siblings: [{ id: 15 }, { id: 13 }], expected: 15 },
    { siblings: [], expected: undefined },
  ])("resolves the first shared sibling of one of our stations: $expected", async ({ siblings, expected }) => {
    scriptPublicSources();
    dbMock.query.stations.findFirst.mockImplementation(async (input) => storedStation(input));
    dbMock.query.stationsOfficialSites.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "stations", siblings);
    if (expected !== undefined) scriptPublicSources();

    const sibling = await resolveSharedSibling(await resolveTerrainStation({ source: "internal", id: 12 }));

    expect(sibling?.station.id).toBe(expected);
    expect(sibling?.station.source).toBe(expected === undefined ? undefined : "internal");
    const [lookup] = lookups("stations");
    expect(dialect.sqlToQuery(lookup?.clauses.where?.[0] as SQL).params).toEqual([2, 8, 8, "jv_member", "jv_member"]);
    expect(lookups("stations")).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([
    { siblings: [{ id: 31 }], expected: 31 },
    { siblings: [], expected: undefined },
  ])("resolves the official site with the lowest id whose operator shares a network: $expected", async ({ siblings, expected }) => {
    scriptPublicSources();
    dbMock.query.officialSites.findFirst.mockImplementation(async (input) => storedStation(input));
    dbMock.enqueueFor("select", officialSitesTable, siblings);
    if (expected !== undefined) scriptPublicSources();

    const sibling = await resolveSharedSibling(await resolveTerrainStation({ source: "official", id: 12 }));

    expect(sibling?.station.id).toBe(expected);
    expect(sibling?.station.source).toBe(expected === undefined ? undefined : "official");
    const [lookup] = lookups(officialSitesTable);
    expect(lookup).toMatchObject({ operation: "select", table: officialSitesTable, clauses: { limit: [1] } });
    expect(dialect.sqlToQuery(lookup?.clauses.where?.[0] as SQL).params).toEqual([2, 8, 8, "jv_member", "jv_member"]);
    expect(lookup?.clauses.orderBy?.map((order) => queryOf(order).sql)).toEqual(['"official"."sites"."id" asc']);
    expect(dbMock.query.stations.findFirst).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });
});
