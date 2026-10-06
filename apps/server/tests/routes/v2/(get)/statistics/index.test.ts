import {
  analyzerUsage,
  contributionSnapshots,
  lteCells,
  nrCells,
  stations,
  ukeImportMetadata,
  ukeLocations,
  ukePermits,
  ukeRadiolines,
} from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import getAnalyzerUsage from "../../../../../src/routes/v2/(get)/statistics/analyzer-usage.js";
import getCompleteness from "../../../../../src/routes/v2/(get)/statistics/completeness.js";
import getHistory from "../../../../../src/routes/v2/(get)/statistics/history.js";
import getStatistics from "../../../../../src/routes/v2/(get)/statistics/index.js";
import getBreakdown from "../../../../../src/routes/v2/(get)/statistics/stations.js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { readDate } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getStatistics", () => {
  it("sorts countries, translates status counts and fills countries with no data", async () => {
    redisMock.isReady = false;
    dbMock.enqueueFor("select", "countries", [
      { code: "US", isVisible: true },
      { code: "PL", isVisible: true },
    ]);
    dbMock.enqueueFor("select", getTableName(stations), [
      { countryCode: "PL", status: "published", value: 4, updatedAt: readDate },
      { countryCode: "PL", status: "pending", value: 2, updatedAt: new Date("2026-10-01T00:00:00Z") },
      { countryCode: null, status: "published", value: 100, updatedAt: readDate },
    ]);
    dbMock.enqueueFor("select", "cells", [{ countryCode: "PL", value: 9 }]);
    dbMock.enqueueFor("select", "locations", [{ countryCode: "PL", value: 3 }]);
    dbMock.enqueueFor("select", getTableName(ukeLocations), [{ value: 1 }]);
    dbMock.enqueueFor("select", getTableName(ukePermits), [{ value: 2 }]);
    dbMock.enqueueFor("select", getTableName(ukeRadiolines), [{ value: 3 }]);
    dbMock.enqueueFor("select", getTableName(ukeImportMetadata), [{ value: readDate }], [{ value: null }]);
    const app = await createRouteHarness(getStatistics);
    const response = await app.inject({ method: "GET", url: "/statistics" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          countryCode: "PL",
          stations: { active: 4, awaitingCells: 2, inactive: 0 },
          cells: 9,
          locations: 3,
          updatedAt: readDate.toISOString(),
          official: { locations: 1, permits: 2, microwaveLinks: 3, permitsImportedAt: readDate.toISOString(), microwaveLinksImportedAt: null },
        },
        { countryCode: "US", stations: { active: 0, awaitingCells: 0, inactive: 0 }, cells: 0, locations: 0, updatedAt: null, official: null },
      ],
    });
  });

  it("returns an empty collection without loading aggregates when no countries are visible", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getStatistics);
    expect((await app.inject({ method: "GET", url: "/statistics?countryCodes=PL" })).json()).toEqual({ data: [] });
    expect(dbMock.calls).toHaveLength(1);
  });
});

describe("getCompleteness", () => {
  it("joins technology counts by country and fills absent technologies with zero", async () => {
    redisMock.isReady = false;
    dbMock.enqueueFor("select", "countries", [
      { code: "PL", isVisible: true },
      { code: "US", isVisible: true },
    ]);
    dbMock.enqueueFor("select", getTableName(stations), [{ countryCode: "PL", total: 5, withSectors: 3, withIdentifiers: 2 }]);
    dbMock.enqueueFor("select", getTableName(lteCells), [{ countryCode: "PL", total: 8, withPci: 7 }]);
    dbMock.enqueueFor("select", getTableName(nrCells), [{ countryCode: null, total: 99, withPci: 99 }]);
    const app = await createRouteHarness(getCompleteness);
    const response = await app.inject({ method: "GET", url: "/statistics/completeness" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          countryCode: "PL",
          stations: { total: 5, withSectors: 3, withIdentifiers: 2 },
          cells: { lte: { total: 8, withPci: 7 }, nr: { total: 0, withPci: 0 } },
        },
        {
          countryCode: "US",
          stations: { total: 0, withSectors: 0, withIdentifiers: 0 },
          cells: { lte: { total: 0, withPci: 0 }, nr: { total: 0, withPci: 0 } },
        },
      ],
    });
  });

  it("returns no completeness data for inaccessible countries", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getCompleteness);
    expect((await app.inject({ method: "GET", url: "/statistics/completeness" })).json()).toEqual({ data: [] });
    expect(dbMock.calls).toHaveLength(1);
  });
});

describe("getBreakdown", () => {
  it("does not load station aggregates when the requested countries are unavailable", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getBreakdown);
    const response = await app.inject({ url: "/statistics/stations?countryCodes=PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.some((call) => call.table === getTableName(stations))).toBe(false);
  });

  it("uses country-only grouping when no dimensions are requested", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    const row = { countryCode: "PL", regionId: null, operatorId: null, rat: null, bandId: null, stations: 2, cells: 4 };
    dbMock.enqueueFor("select", getTableName(stations), [row]);
    const app = await createRouteHarness(getBreakdown);
    const response = await app.inject({ url: "/statistics/stations" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [row] });
  });

  it("excludes inaccessible countries and translates database technologies", async () => {
    redisMock.isReady = false;
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    const row = { countryCode: "PL", regionId: null, operatorId: null, rat: "LTE", bandId: 3, stations: 2, cells: 4 };
    dbMock.enqueueFor("select", getTableName(stations), [
      row,
      { ...row, countryCode: "US" },
      { ...row, countryCode: null },
      { ...row, rat: "unsupported" },
    ]);
    const app = await createRouteHarness(getBreakdown);
    const response = await app.inject({ method: "GET", url: "/statistics/stations?groupBy=rat,band" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ ...row, rat: "lte" }] });
  });

  it.each(["groupBy=rat,rat", "groupBy=technology", "countryCodes=pl"])("rejects an invalid breakdown grouping: %s", async (query) => {
    const app = await createRouteHarness(getBreakdown);
    expect((await app.inject({ method: "GET", url: `/statistics/stations?${query}` })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("getHistory", () => {
  it.each(["day", "month"])("computes changes per country from %s snapshots", async (interval) => {
    dbMock.enqueueFor("select", "countries", [
      { code: "PL", isVisible: true },
      { code: "US", isVisible: true },
    ]);
    const totals = { totalStations: 10, totalCells: 20, totalSectors: 3, totalExtraIds: 4, totalCellsWithPCI: 5 };
    dbMock.enqueueFor("select", getTableName(contributionSnapshots), [
      { ...totals, countryCode: "PL", snapshot_date: new Date("2026-01-01T00:00:00Z") },
      { ...totals, totalStations: 12, countryCode: "PL", snapshot_date: new Date("2026-01-31T00:00:00Z") },
      { ...totals, totalStations: 11, countryCode: "PL", snapshot_date: new Date("2026-02-01T00:00:00Z") },
      { ...totals, totalStations: 100, countryCode: "US", snapshot_date: new Date("2026-01-01T00:00:00Z") },
    ]);
    const app = await createRouteHarness(getHistory);
    const response = await app.inject({ method: "GET", url: `/statistics/history?interval=${interval}` });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data).toHaveLength(interval === "day" ? 4 : 3);
    expect(data[0].snapshotOn).toBe(interval === "day" ? "2026-01-01" : "2026-01-31");
    expect(data[0].added).toEqual({ stations: 0, cells: 0, sectors: 0, identifiers: 0, cellsWithPci: 0 });
    expect(data.at(-2).added.stations).toBe(-1);
    expect(data.at(-1).added.stations).toBe(0);
  });

  it.each(["takenAfter=2026-02-30", "interval=week", "extra=1"])("rejects invalid historical queries: %s", async (query) => {
    const app = await createRouteHarness(getHistory);
    expect((await app.inject({ method: "GET", url: `/statistics/history?${query}` })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});

describe("getAnalyzerUsage", () => {
  it.each(["day", "month"])("reports analyzer usage by %s without losing zero-count days", async (interval) => {
    dbMock.enqueueFor("select", getTableName(analyzerUsage), [
      { date: "2026-01-01", count: 0 },
      { date: "2026-01-02", count: 2 },
      { date: "2026-02-01", count: 4 },
    ]);
    const app = await createRouteHarness(getAnalyzerUsage);
    const response = await app.inject({ method: "GET", url: `/statistics/analyzer-usage?interval=${interval}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data:
        interval === "day"
          ? [
              { startsOn: "2026-01-01", count: 0 },
              { startsOn: "2026-01-02", count: 2 },
              { startsOn: "2026-02-01", count: 4 },
            ]
          : [
              { startsOn: "2026-01-01", count: 2 },
              { startsOn: "2026-02-01", count: 4 },
            ],
    });
  });

  it("returns an empty collection when no analyzer usage exists", async () => {
    dbMock.enqueueFor("select", getTableName(analyzerUsage), []);
    const app = await createRouteHarness(getAnalyzerUsage);
    expect((await app.inject({ method: "GET", url: "/statistics/analyzer-usage" })).json()).toEqual({ data: [] });
  });
});
