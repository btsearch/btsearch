import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/locations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit, whereQuery } from "../../../../helpers/mutationAssertions.js";

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
const ownAddressRequest = { ...request, payload: { ...request.payload, address: "teren własny" } };
const ownAddressRefusal = {
  errors: [
    {
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: [{ field: "address", validationMessage: "Address must not contain variants of własny" }],
    },
  ],
};

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

  it("refuses an address that a location in Poland does not take, at its field", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const response = await injectMutation(route, ownAddressRequest, options);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("refuses that address for an existing Polish location too, although its fields would be ignored", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const response = await injectMutation(route, ownAddressRequest, options);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
  });

  it("goes by the region the coordinates fall in, not the one the request names", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const response = await injectMutation(route, { ...ownAddressRequest, payload: { ...ownAddressRequest.payload, regionId: 99 } }, options);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(whereQuery("regions", "select").params).toEqual([1]);
  });

  it("accepts the same address for a location in a country without a pack", async () => {
    const created = { ...row, region_id: 99, city: "Berlin", address: "teren własny" };
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 99 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "DE" }]);
    dbMock.enqueueFor("insert", "locations", [created]);
    dbMock.enqueueFor("select", "locations", [{ location: created, region: { countryCode: "DE" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, { ...ownAddressRequest, payload: { ...ownAddressRequest.payload, regionId: 99 } }, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { countryCode: "DE", address: "teren własny" } });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "locations")?.values).toMatchObject({ address: "teren własny" });
  });
});
