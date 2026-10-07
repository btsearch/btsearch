import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/locations/[id].js";
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
const request = { method: "DELETE" as const, url: "/locations/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /locations", () => {
  it("checks the actual location region before an editor can delete it", async () => {
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
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("count", "stations", 0);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "FAILED_TO_DELETE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("applies the documented location mutation", async () => {
    scriptAudit();
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("count", "stations", 0);
    dbMock.enqueueFor("select", "location_photos", []);
    dbMock.enqueueFor("delete", "locations", []);

    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });
  it("returns 404 for an absent location", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
  });

  it("refuses deleting a location that still contains any station", async () => {
    dbMock.query.locations.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("count", "stations", 1);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "Cannot delete a location that still has stations");
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });
});
