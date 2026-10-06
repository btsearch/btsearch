import { describe, expect, it } from "vitest";

import getRegion from "../../../../../src/routes/v2/(get)/regions/[id].js";
import getRegions from "../../../../../src/routes/v2/(get)/regions/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const region = { id: 1, countryCode: "PL", code: "LD", name: "Łódzkie", isoCode: "PL-10" };

describe("getRegions", () => {
  it("returns the region found at a coordinate pair", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueue([{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [region]);
    const app = await createRouteHarness(getRegions);
    const response = await app.inject({ method: "GET", url: "/regions?latitude=52&longitude=21" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [region] });
    expect(dbMock.execute).toHaveBeenCalledOnce();
  });

  it("returns an empty collection when a point lies in no region", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueue([{ regionId: null }]);
    const app = await createRouteHarness(getRegions);
    const response = await app.inject({ method: "GET", url: "/regions?latitude=0&longitude=0" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.filter((call) => call.table === "regions")).toHaveLength(0);
  });

  it("lists the visible country's regions without point lookup", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "regions", [region]);
    const app = await createRouteHarness(getRegions);
    expect((await app.inject({ method: "GET", url: "/regions?countryCodes=PL" })).json()).toEqual({ data: [region] });
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it.each(["latitude=0", "longitude=0", "latitude=0&longitude=0&bbox=0,0,1,1"])(
    "rejects contradictory selectors before database access: %s",
    async (query) => {
      const app = await createRouteHarness(getRegions);
      expect((await app.inject({ method: "GET", url: `/regions?${query}` })).statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );
});

describe("getRegion", () => {
  it("serializes a visible region", async () => {
    dbMock.query.regions.findFirst.mockResolvedValue(region);
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    const app = await createRouteHarness(getRegion);
    const response = await app.inject({ method: "GET", url: "/regions/1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [region][0] });
  });

  it.each([true, false])("hides missing or inaccessible regions (%s)", async (exists) => {
    dbMock.query.regions.findFirst.mockResolvedValue(exists ? region : undefined);
    if (exists) dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getRegion);
    const response = await app.inject({ method: "GET", url: "/regions/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
