import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/locations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = {
  id: 7,
  region_id: 1,
  latitude: 52,
  longitude: 21,
  city: "Warsaw",
  address: null,
  structure_type: null,
  structure_owner_id: null,
  structure_note: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "POST" as const, url: "/locations", payload: { latitude: 52, longitude: 21, regionId: 1, city: "Warsaw" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /locations", () => {
  it("checks the actual destination coordinates against the editor's grants before creating a location", async () => {
    const session = userSession(undefined, "editor");
    authBoundary.getCurrentUser.mockResolvedValue(session);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: true, regionId: null }]);
    dbMock.enqueue([{ regionId: 99 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "DE", regionId: 99 }]);
    expectError(
      await injectMutation(route, request, { session, runAuth: true }),
      403,
      "INSUFFICIENT_PERMISSIONS",
      "Your editor access does not cover this region",
    );
    expect(dbMock.query.locations.findFirst).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("applies the documented location mutation", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueue([{ regionId: 1 }]);
    dbMock.enqueueFor("insert", "locations", [row]);
    dbMock.enqueueFor("select", "locations", [{ location: row, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: 7, countryCode: "PL" } });
  });

  it("returns an existing location unchanged with 200 despite new fields", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "locations", [{ location: row, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, { ...request, payload: { ...request.payload, city: "Different" } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { city: "Warsaw" } });
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("requires a region when coordinates cannot be resolved", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueue([{ regionId: null }]);
    const response = await injectMutation(route, { ...request, payload: { latitude: 52, longitude: 21 } }, options);
    expectError(response, 400, "BAD_REQUEST", "No region could be worked out for these coordinates, send regionId");
    expect(dbMock.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("rejects providing only one coordinate", async () => {
    const response = await injectMutation(route, { ...request, payload: { latitude: 52 } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
