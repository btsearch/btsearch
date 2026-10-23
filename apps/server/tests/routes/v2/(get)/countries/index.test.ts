import { describe, expect, it } from "vitest";

import getCountry from "../../../../../src/routes/v2/(get)/countries/[code].js";
import getCountryBands from "../../../../../src/routes/v2/(get)/countries/[code]/bands/index.js";
import getCountries from "../../../../../src/routes/v2/(get)/countries/index.js";
import { cacheInRedis, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { SOURCE_VISIBILITY_KEY, cacheCountryVisibility } from "../../../../helpers/officialDataFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const features = { structureOwnerProposals: false, psc: true, bsic: false };
const packCapabilities = {
  official: true,
  microwaveLinks: true,
  emf: true,
  terrainProfiles: { receiverBounds: { west: 13.8, south: 48.8, east: 24.5, north: 55.2 } },
  kmz: true,
};
const noCapabilities = { official: false, microwaveLinks: false, emf: false, terrainProfiles: null, kmz: false };
const tools = ["analyzer", "measurements"];
const visible = { code: "PL", isVisible: true, contributions: "open", tools, features, capabilities: packCapabilities, defaultView: null };
const hidden = { code: "US", isVisible: false, contributions: "closed", tools, features, capabilities: noCapabilities, defaultView: null };
const viewColumns = { ...features, viewWest: null, viewSouth: null, viewEast: null, viewNorth: null };
const polishSource = { id: 1, countryCode: "PL", isVisible: true, layers: ["sites", "microwave_links"] };

function scriptSourceCapabilities(hiddenCountryCodes: string[], sources = [polishSource]) {
  cacheCountryVisibility(hiddenCountryCodes);
  cacheInRedis(SOURCE_VISIBILITY_KEY, sources);
}

describe("getCountries", () => {
  it.each(["guest", "user", "editor", "admin"] as const)("applies country visibility to %s viewers", async (role) => {
    dbMock.query.countries.findMany.mockResolvedValue([
      { ...visible, ...viewColumns },
      { ...hidden, ...viewColumns },
    ]);
    if (role !== "guest") {
      dbMock.enqueueFor("select", "users", [{ role }]);
      dbMock.enqueueFor(
        "select",
        "role_grants",
        role === "editor" ? [{ countryCode: "US", grantRole: "editor", isCountryWide: false, regionId: 1 }] : [],
      );
    }
    scriptSourceCapabilities(["US"]);
    const app = await createRouteHarness(getCountries, { session: role === "guest" ? undefined : userSession(userId, role) });
    const response = await app.inject({ method: "GET", url: "/countries" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: role === "editor" || role === "admin" ? [visible, hidden] : [visible] });
  });

  it("returns an empty collection when no countries exist", async () => {
    dbMock.query.countries.findMany.mockResolvedValue([]);
    scriptSourceCapabilities([], []);
    const app = await createRouteHarness(getCountries);
    expect((await app.inject({ method: "GET", url: "/countries" })).json()).toEqual({ data: [] });
    expect(dbMock.calls).toEqual([]);
  });

  it("takes the official layers from the visible sources, read from the cache, and the rest from the country's pack", async () => {
    dbMock.query.countries.findMany.mockResolvedValue([
      { ...visible, ...viewColumns },
      { ...visible, ...viewColumns, code: "US" },
    ]);
    scriptSourceCapabilities(
      [],
      [
        polishSource,
        { id: 2, countryCode: "US", isVisible: true, layers: ["sites"] },
        { id: 3, countryCode: "US", isVisible: false, layers: ["microwave_links"] },
      ],
    );
    const app = await createRouteHarness(getCountries);
    const response = await app.inject({ method: "GET", url: "/countries" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((country: { capabilities: unknown }) => country.capabilities)).toEqual([
      packCapabilities,
      { ...noCapabilities, official: true },
    ]);
    expect(dbMock.calls).toEqual([]);
  });

  it("gives a guest no official layers while every source is hidden, and an administrator those of the hidden source", async () => {
    dbMock.query.countries.findMany.mockResolvedValue([{ ...visible, ...viewColumns }]);
    scriptSourceCapabilities([], [{ ...polishSource, isVisible: false }]);
    const guestApp = await createRouteHarness(getCountries);
    const guestView = (await guestApp.inject({ method: "GET", url: "/countries" })).json().data[0].capabilities;
    expect(guestView).toEqual({ ...packCapabilities, official: false, microwaveLinks: false, kmz: false });

    const adminApp = await createRouteHarness(getCountries, { session: userSession(userId, "admin") });
    expect((await adminApp.inject({ method: "GET", url: "/countries" })).json().data[0].capabilities).toEqual(packCapabilities);
  });
});

describe("getCountry", () => {
  it("returns a visible country's configured view", async () => {
    const row = { ...visible, defaultView: { west: 170, south: -10, east: -170, north: 10 } };
    dbMock.query.countries.findFirst.mockResolvedValue({ ...visible, ...features, viewWest: 170, viewSouth: -10, viewEast: -170, viewNorth: 10 });
    scriptSourceCapabilities([]);
    const app = await createRouteHarness(getCountry);
    const response = await app.inject({ method: "GET", url: "/countries/PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: row });
    expect(dbMock.query.countries.findFirst).toHaveBeenCalledWith({ where: { code: "PL" } });
  });

  it.each([undefined, hidden])("returns the same missing-resource envelope for absent or hidden countries %j", async (row) => {
    dbMock.query.countries.findFirst.mockResolvedValue(row);
    scriptSourceCapabilities([]);
    const app = await createRouteHarness(getCountry);
    const response = await app.inject({ method: "GET", url: "/countries/US" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });

  it("rejects an invalid country path pl before querying", async () => {
    const app = await createRouteHarness(getCountry);
    expect((await app.inject({ method: "GET", url: "/countries/pl" })).statusCode).toBe(400);
    expect(dbMock.query.countries.findFirst).not.toHaveBeenCalled();
  });
});

describe("getCountryBands", () => {
  it.each([false, true])("returns planned band references with include=band %s", async (include) => {
    dbMock.enqueueFor("select", "countries", [visible]);
    dbMock.enqueueFor("select", "country_bands", [
      {
        plan: { countryCode: "PL", bandId: 3 },
        band: { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" },
      },
    ]);
    const app = await createRouteHarness(getCountryBands);
    const response = await app.inject({ method: "GET", url: `/countries/PL/bands${include ? "?include=band" : ""}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ countryCode: "PL", bandId: 3 });
    if (include) expect(response.json().data[0].band).toMatchObject({ id: 3, rat: "lte", number: 3 });
    else expect(response.json().data[0]).not.toHaveProperty("band");
  });

  it("requires a visible parent before loading a country's plan", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getCountryBands);
    const response = await app.inject({ method: "GET", url: "/countries/US/bands" });
    expect(response.statusCode).toBe(404);
    expect(dbMock.calls.filter((call) => call.table === "country_bands")).toHaveLength(0);
  });
});
