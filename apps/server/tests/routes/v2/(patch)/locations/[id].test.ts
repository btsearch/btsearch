import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/locations/[id].js";
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
const request = { method: "PATCH" as const, url: "/locations/7", payload: { city: "" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const ownAddressRequest = { ...request, payload: { address: "teren własny" } };
const ownAddressRefusal = {
  errors: [
    {
      code: "VALIDATION_ERROR",
      message: "Validation error",
      details: [{ field: "address", validationMessage: "Address must not contain variants of własny" }],
    },
  ],
};

describe("PATCH /locations", () => {
  it("checks a metadata-only edit against the location's existing region", async () => {
    const session = userSession(undefined, "editor");
    authBoundary.getCurrentUser.mockResolvedValue(session);
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: true, regionId: null }]);
    dbMock.enqueueFor("select", "locations", [{ countryCode: "DE", regionId: 99 }]);
    expectError(
      await injectMutation(route, request, { session, runAuth: true }),
      403,
      "INSUFFICIENT_PERMISSIONS",
      "Your editor access does not cover this region",
    );
    expect(dbMock.query.locations.findFirst).not.toHaveBeenCalled();
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
  });

  it("clears an empty address while leaving omitted city unchanged", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("update", "locations", [row]);
    dbMock.enqueueFor("select", "locations", [{ location: row, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    expect((await injectMutation(route, { ...request, payload: { address: "" } }, options)).statusCode).toBe(200);
    const changes = dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values;
    expect(changes).toMatchObject({ address: null });
    expect(changes).not.toHaveProperty("city");
  });

  it("applies the documented location mutation", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("update", "locations", [{ ...row, city: null }]);
    dbMock.enqueueFor("select", "locations", [{ location: { ...row, city: null }, region: { countryCode: "PL" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: 7, countryCode: "PL" } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values).toMatchObject({ city: null });
  });
  it("returns 404 for an absent location", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("rejects providing only one coordinate", async () => {
    const response = await injectMutation(route, { ...request, payload: { latitude: 52 } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses an address that a location in Poland does not take, at its field", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const response = await injectMutation(route, ownAddressRequest, options);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("goes by the region a location moves to", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue({ ...row, region_id: 99 });
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("select", "locations", []);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    const payload = { latitude: 52.1, longitude: 21.1, address: "teren własny" };
    const response = await injectMutation(route, { ...request, payload }, options);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(ownAddressRefusal);
    expect(whereQuery("regions", "select").params).toEqual([1]);
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("accepts the same address for a location in a country without a pack", async () => {
    const stored = { ...row, region_id: 99, city: "Berlin" };
    const saved = { ...stored, address: "teren własny" };
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(stored);
    dbMock.query.stations.findMany.mockResolvedValue([]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "DE" }]);
    dbMock.enqueueFor("update", "locations", [saved]);
    dbMock.enqueueFor("select", "locations", [{ location: saved, region: { countryCode: "DE" }, owner: null }]);
    dbMock.enqueueFor("select", "countries", []);
    const response = await injectMutation(route, ownAddressRequest, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { countryCode: "DE", address: "teren własny" } });
    expect(whereQuery("regions", "select").params).toEqual([stored.region_id]);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values).toMatchObject({ address: "teren własny" });
  });
});
