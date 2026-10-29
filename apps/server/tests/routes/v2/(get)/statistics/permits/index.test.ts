import { officialLocations, officialPermits, officialSites, officialSources, regions } from "@openbts/drizzle";
import { getTableUniqueName, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { findDocumentationGap } from "../../../../../../src/features/openapi/document.js";
import historyRoute from "../../../../../../src/routes/v2/(get)/statistics/permits/history.js";
import route from "../../../../../../src/routes/v2/(get)/statistics/permits/index.js";
import { dbMock, redisMock, userSession } from "../../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const permitsTable = getTableUniqueName(officialPermits);
const lte800 = { rat: "lte", labelMhz: 800, variant: "commercial" };
const group = { countryCode: "PL", operatorId: 3, regionId: null, ...lte800 };

function scriptVisibleCountries(countryCodes: string[]) {
  redisMock.isReady = false;
  dbMock.enqueueFor(
    "select",
    "countries",
    countryCodes.map((code) => ({ code, isVisible: true })),
  );
}

function scriptPublicSources(sourceIds: number[]) {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor(
    "select",
    getTableUniqueName(officialSources),
    [1, 2, 3].map((id) => ({ id, countryCode: "PL", isVisible: sourceIds.includes(id) })),
  );
}

function permitGrouping() {
  return dbMock.calls.find((call) => call.table === permitsTable)?.clauses.groupBy;
}

describe("GET /statistics/permits", () => {
  it.each([route, historyRoute])("$url is documented and open to guests with the permission to read statistics", (permitRoute) => {
    expect(findDocumentationGap(permitRoute as unknown as Parameters<typeof findDocumentationGap>[0])).toBeUndefined();
    expect(permitRoute.config).toEqual({ permissions: ["read:stats"], allowGuestAccess: true });
  });

  it("adds up the visible sources' rows of a group and leaves out hidden sources and countries you cannot access", async () => {
    scriptVisibleCountries(["PL"]);
    scriptPublicSources([1, 3]);
    dbMock.enqueueFor("select", permitsTable, [
      { sourceId: 1, ...group, sites: 2, permits: 3 },
      { sourceId: 2, ...group, sites: 50, permits: 50 },
      { sourceId: 3, ...group, sites: 1, permits: 4 },
      { sourceId: 1, ...group, countryCode: "DE", sites: 7, permits: 7 },
    ]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ url: "/statistics/permits?groupBy=operator,label" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [{ ...group, sites: 3, permits: 7 }] });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("counts every source for an administrator, hidden or not", async () => {
    scriptVisibleCountries(["PL"]);
    scriptPublicSources([]);
    dbMock.enqueueFor("select", permitsTable, [
      { sourceId: 1, ...group, sites: 2, permits: 3 },
      { sourceId: 2, ...group, sites: 5, permits: 5 },
    ]);
    const app = await createRouteHarness(route, { session: userSession(undefined, "admin") });
    const response = await app.inject({ url: "/statistics/permits?groupBy=operator,label" });
    expect(response.json()).toEqual({ data: [{ ...group, sites: 7, permits: 8 }] });
  });

  it("groups by the source and the location's country", async () => {
    scriptVisibleCountries(["PL"]);
    scriptPublicSources([1]);
    dbMock.enqueueFor("select", permitsTable, []);
    const app = await createRouteHarness(route);
    await app.inject({ url: "/statistics/permits" });

    expect(permitGrouping()).toEqual([officialSites.source_id, regions.countryCode]);
  });

  it("groups by each column once when the technology is grouped on its own and as part of the band", async () => {
    scriptVisibleCountries(["PL"]);
    scriptPublicSources([1]);
    dbMock.enqueueFor("select", permitsTable, []);
    const app = await createRouteHarness(route);
    await app.inject({ url: "/statistics/permits?groupBy=label,rat,region" });

    expect(permitGrouping()).toEqual([
      officialSites.source_id,
      regions.countryCode,
      sql`${officialLocations.region_id}`,
      sql`${officialPermits.rat}`,
      sql`${officialPermits.label_mhz}`,
      sql`${officialPermits.label_variant}`,
    ]);
  });

  it("does not count anything when no requested country is visible", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(route);
    expect((await app.inject({ url: "/statistics/permits?countryCodes=PL" })).json()).toEqual({ data: [] });
    expect(dbMock.calls).toHaveLength(1);
  });

  it.each(["groupBy=label,label", "groupBy=band", "countryCodes=pl", "extra=1"])("rejects the invalid query %s", async (query) => {
    const app = await createRouteHarness(route);
    expect((await app.inject({ url: `/statistics/permits?${query}` })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
