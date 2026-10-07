import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(get)/audit-operations/index.js";
import { auditOperationRow, scriptMaintainer } from "../../../../helpers/auditFixtures.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

const request = { method: "GET" as const, url: "/audit-operations" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("GET /audit-operations", () => {
  it("returns operation summaries and aggregate counts without individual entries", async () => {
    dbMock.enqueueFor("select", "audit_operations", [{ operation: auditOperationRow, key: auditOperationRow.createdAt }], [{ total: 1 }]);
    dbMock.enqueueFor("select", "audit_logs", [{ operation_id: 7, entity: "settings", op: "update", count: 2, station_ids: [] }]);
    const response = await injectMutation(route, { ...request, url: "/audit-operations?includeTotal=true" }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [
        { id: 7, entryCount: 2, counts: [{ entity: "settings", action: "update", count: 2 }], ipAddress: "192.0.2.1", userAgent: "Test Browser" },
      ],
      paging: { total: 1, nextCursor: null },
    });
    expect(response.json().data[0]).not.toHaveProperty("entries");
    expect(response.json().data[0]).not.toHaveProperty("stations");
    expect(dbMock.calls.some((call) => call.table === "stations")).toBe(false);
  });

  it("adds the stations that still exist to every operation of the page with one station query", async () => {
    dbMock.enqueueFor("select", "audit_operations", [
      { operation: auditOperationRow, key: auditOperationRow.createdAt },
      { operation: { ...auditOperationRow, id: 8 }, key: auditOperationRow.createdAt },
    ]);
    dbMock.enqueueFor("select", "audit_logs", [
      { operation_id: 7, entity: "stations", op: "update", count: 2, station_ids: [12, 13] },
      { operation_id: 8, entity: "cells", op: "delete", count: 1, station_ids: [13] },
    ]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "stations", [{ id: 13, siteId: "BT-13", operatorId: 4 }]);
    const response = await injectMutation(route, { ...request, url: "/audit-operations?include=stations" }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([
      { id: 7, stationIds: [12, 13], stations: [{ id: 13, siteId: "BT-13", operatorId: 4 }] },
      { id: 8, stationIds: [13], stations: [{ id: 13, siteId: "BT-13", operatorId: 4 }] },
    ]);
    expect(dbMock.calls.filter((call) => call.table === "stations")).toHaveLength(1);
    expect(whereQuery("stations", "select").params).toEqual([12, 13]);
  });

  it("leaves out the stations a maintainer may not read: hidden countries and countries they do not maintain", async () => {
    scriptMaintainer();
    dbMock.enqueueFor("select", "audit_operations", [{ operation: auditOperationRow, key: auditOperationRow.createdAt }]);
    dbMock.enqueueFor("select", "audit_logs", [{ operation_id: 7, entity: "stations", op: "update", count: 1, station_ids: [12] }]);
    dbMock.enqueueFor("select", "countries", [{ code: "DE" }]);
    dbMock.enqueueFor("select", "stations", []);
    const response = await injectMutation(
      route,
      { ...request, url: "/audit-operations?include=stations" },
      { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "editor") },
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([{ stationIds: [12], stations: [] }]);
    expect(whereQuery("stations", "select").params).toEqual(expect.arrayContaining([12, "PL", "DE"]));
  });

  it("looks up the stations of a mass operation in chunks of 5000 ids and returns them all", async () => {
    const stationIds = Array.from({ length: 5001 }, (_, index) => index + 1);
    dbMock.enqueueFor("select", "audit_operations", [{ operation: auditOperationRow, key: auditOperationRow.createdAt }]);
    dbMock.enqueueFor("select", "audit_logs", [{ operation_id: 7, entity: "stations", op: "update", count: 5001, station_ids: stationIds }]);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "stations", [{ id: 1, siteId: "BT-1", operatorId: 4 }], [{ id: 5001, siteId: "BT-5001", operatorId: null }]);
    const response = await injectMutation(route, { ...request, url: "/audit-operations?include=stations" }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data[0].stationIds).toHaveLength(5001);
    expect(response.json().data[0].stations).toEqual([
      { id: 1, siteId: "BT-1", operatorId: 4 },
      { id: 5001, siteId: "BT-5001", operatorId: null },
    ]);
    expect(dbMock.calls.filter((call) => call.table === "stations")).toHaveLength(2);
    expect(whereQuery("stations", "select").params).toHaveLength(5000);
  });

  it("does not look up stations for a page whose operations name none", async () => {
    dbMock.enqueueFor("select", "audit_operations", [{ operation: auditOperationRow, key: auditOperationRow.createdAt }]);
    dbMock.enqueueFor("select", "audit_logs", [{ operation_id: 7, entity: "settings", op: "update", count: 2, station_ids: [] }]);
    const response = await injectMutation(route, { ...request, url: "/audit-operations?include=stations" }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([{ stationIds: [], stations: [] }]);
    expect(dbMock.calls.some((call) => call.table === "stations")).toBe(false);
  });

  it("limits maintainers to their countries and hides client identifiers", async () => {
    scriptMaintainer();
    dbMock.enqueueFor("select", "audit_operations", [{ operation: auditOperationRow, key: auditOperationRow.createdAt }]);
    dbMock.enqueueFor("select", "audit_logs", []);
    const response = await injectMutation(route, request, { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "editor") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ countryCode: "PL", ipAddress: null, userAgent: null }] });
    expect(whereQuery("audit_operations", "select").params).toContain("PL");
  });

  it("returns an empty list when a maintainer requests a country outside their grants", async () => {
    scriptMaintainer();
    const response = await injectMutation(route, { ...request, url: "/audit-operations?countryCodes=DE&includeTotal=true" }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
    expect(dbMock.calls.some((call) => call.table === "audit_operations")).toBe(false);
  });

  it("matches entity, action and station filters against the same audit entry", async () => {
    dbMock.enqueueFor("select", "audit_operations", []);
    const response = await injectMutation(
      route,
      { ...request, url: "/audit-operations?entities=stations&actions=update&stationIds=12&q=12" },
      options,
    );
    expect(response.statusCode).toBe(200);
    const where = whereQuery("audit_operations", "select");
    expect(where.sql.match(/EXISTS/g)).toHaveLength(1);
    expect(where.params).toEqual(expect.arrayContaining(["stations", "update", 12, "12"]));
  });

  it("requires administrator or country maintainer access", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(await injectMutation(route, request, options), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("rejects guests without querying operations", async () => {
    expectError(await injectMutation(route, request), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["?limit=0", "?limit=201", "?offset=-1", "?cursor=x&offset=0", "?entities=not-a-table", "?sort=id", "?q=", "?include=entries"])(
    "validates audit query %s",
    async (query) => {
      expectError(await injectMutation(route, { ...request, url: request.url + query }, options), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("rejects malformed opaque cursors before querying the database", async () => {
    expectError(await injectMutation(route, { ...request, url: "/audit-operations?cursor=malformed" }, options), 400, "INVALID_QUERY");
    expect(dbMock.calls).toEqual([]);
  });
});
