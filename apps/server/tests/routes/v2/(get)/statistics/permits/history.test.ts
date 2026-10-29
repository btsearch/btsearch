import { statsSnapshots } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/statistics/permits/history.js";
import { cacheInRedis, dbMock, queryOf } from "../../../../../helpers/boundaries.js";
import { COUNTRY_VISIBILITY_KEY, SOURCE_VISIBILITY_KEY } from "../../../../../helpers/officialDataFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const snapshotsTable = getTableName(statsSnapshots);
const lte800 = { operatorId: 1, rat: "lte", labelMhz: 800, variant: "commercial" };
const nr3500 = { operatorId: 1, rat: "nr", labelMhz: 3500, variant: "commercial" };

function snapshot(day: string, totals: object) {
  return { countryCode: "PL", snapshotDate: new Date(`${day}T00:00:00Z`), ...totals };
}

function scriptCountriesWithSites(visibleCountryCodes: string[], countryCodesWithSites: string[]) {
  cacheInRedis(
    COUNTRY_VISIBILITY_KEY,
    visibleCountryCodes.map((code) => ({ code, isVisible: true })),
  );
  cacheInRedis(
    SOURCE_VISIBILITY_KEY,
    visibleCountryCodes.map((countryCode, index) => ({
      id: index + 1,
      countryCode,
      isVisible: true,
      layers: countryCodesWithSites.includes(countryCode) ? ["sites"] : ["microwave_links"],
    })),
  );
}

function snapshotFilter() {
  return queryOf(dbMock.calls.find((call) => call.table === snapshotsTable)?.clauses.where?.[0]);
}

describe("GET /statistics/permits/history", () => {
  it("compares each group with the previous snapshot of its country, and counts a new group from zero", async () => {
    scriptCountriesWithSites(["PL"], ["PL"]);
    dbMock.enqueueFor("select", snapshotsTable, [
      snapshot("2026-01-10", { ...lte800, sites: 10, permits: 12 }),
      snapshot("2026-01-11", { ...lte800, sites: 11, permits: 15 }),
      snapshot("2026-01-11", { ...nr3500, sites: 2, permits: 2 }),
    ]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ url: "/statistics/permits/history?interval=day&groupBy=operator,label" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual([
      { countryCode: "PL", snapshotOn: "2026-01-10", ...lte800, sites: 10, permits: 12, added: { sites: 0, permits: 0 } },
      { countryCode: "PL", snapshotOn: "2026-01-11", ...lte800, sites: 11, permits: 15, added: { sites: 1, permits: 3 } },
      { countryCode: "PL", snapshotOn: "2026-01-11", ...nr3500, sites: 2, permits: 2, added: { sites: 2, permits: 2 } },
    ]);
  });

  it("keeps the last snapshot of each month and compares the months with each other", async () => {
    scriptCountriesWithSites(["PL"], ["PL"]);
    const totals = { operatorId: null, rat: null, labelMhz: null, variant: null };
    dbMock.enqueueFor("select", snapshotsTable, [
      snapshot("2026-01-10", { ...totals, sites: 10, permits: 20 }),
      snapshot("2026-01-31", { ...totals, sites: 12, permits: 25 }),
      snapshot("2026-02-15", { ...totals, sites: 11, permits: 30 }),
    ]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ url: "/statistics/permits/history?takenAfter=2026-01-01&takenBefore=2026-02-28" });
    expect(response.json().data).toEqual([
      { countryCode: "PL", snapshotOn: "2026-01-31", ...totals, sites: 12, permits: 25, added: { sites: 0, permits: 0 } },
      { countryCode: "PL", snapshotOn: "2026-02-15", ...totals, sites: 11, permits: 30, added: { sites: -1, permits: 5 } },
    ]);
    expect(snapshotFilter().params).toEqual(["PL", "2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"]);
  });

  it("reads only the countries that have a source with sites you can see", async () => {
    scriptCountriesWithSites(["DE", "PL"], ["PL"]);
    dbMock.enqueueFor("select", snapshotsTable, []);
    const app = await createRouteHarness(route);
    await app.inject({ url: "/statistics/permits/history" });
    expect(snapshotFilter().params).toEqual(["PL"]);
  });

  it("reads no snapshot when no country has such a source", async () => {
    scriptCountriesWithSites(["DE"], []);
    const app = await createRouteHarness(route);
    expect((await app.inject({ url: "/statistics/permits/history" })).json()).toEqual({ data: [] });
    expect(dbMock.calls.some((call) => call.table === snapshotsTable)).toBe(false);
  });

  it.each(["groupBy=region", "groupBy=operator,operator", "interval=week", "takenAfter=2026-02-30"])("rejects %s", async (query) => {
    const app = await createRouteHarness(route);
    expect((await app.inject({ url: `/statistics/permits/history?${query}` })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
