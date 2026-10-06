import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/submissions/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";
import { readLocation, readStation } from "../../../../helpers/readFixtures.js";
import { scriptSubmissionSerialization, submissionRow, submitterId } from "../../../../helpers/submissionFixtures.js";
import {
  foreignReaderId,
  proposalDate,
  proposedStation,
  scriptReaderAccess,
  scriptSubmissionRead,
} from "../../../../helpers/submissionReadFixtures.js";

const request = { method: "GET" as const, url: "/submissions" };
const options = { session: userSession(submitterId) };

describe("GET /submissions", () => {
  it("defaults to the owner's submissions across all review states and keeps optional projections absent", async () => {
    scriptReaderAccess("user");
    dbMock.enqueueFor("select", "submissions", [
      { ...submissionRow, country_code: "PL" },
      { ...submissionRow, id: foreignReaderId, type: "update", status: "approved", reviewed_at: proposalDate, country_code: "DE" },
      { ...submissionRow, id: submitterId, type: "delete", status: "rejected" },
    ]);
    scriptSubmissionRead({ accessLoaded: true, stationRows: [proposedStation] });
    const response = await injectMutation(route, request, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data.map((row: { action: string; status: string }) => [row.action, row.status])).toEqual([
      ["create", "pending"],
      ["update", "accepted"],
      ["delete", "rejected"],
    ]);
    expect(response.json().data[0].changes.station.siteId).toBe("Draft site");
    expect(response.json().data[1].changes.station).toBeNull();
    expect(response.json().data.every((row: object) => !("station" in row))).toBe(true);
    expect(response.json().data.map((row: { countryCode: string | null }) => row.countryCode)).toEqual(["PL", "DE", null]);
    expect(response.json().paging).toEqual({ limit: 50, nextCursor: null });
    expect(whereQuery("submissions", "select").params).toEqual([submitterId]);
    expect(dbMock.calls.filter((call) => call.table === "submissions")).toHaveLength(1);
  });

  it("includes visible stations while preserving hidden and unplaced submissions with null station projections", async () => {
    scriptReaderAccess("user");
    dbMock.enqueueFor(
      "select",
      "submissions",
      [
        { ...submissionRow, station_id: 1, country_code: "PL" },
        { ...submissionRow, id: foreignReaderId, station_id: 2, country_code: "DE" },
        { ...submissionRow, id: submitterId },
      ],
      [{ total: 3 }],
    );
    scriptSubmissionRead({ accessLoaded: true });
    dbMock.enqueueFor("select", "countries", [{ code: "DE" }]);
    dbMock.enqueueFor("select", "stations", [readStation]);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const response = await injectMutation(route, { ...request, url: "/submissions?include=station&includeTotal=true" }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.map((row: { station: unknown }) => row.station)).toEqual([
      expect.objectContaining({ id: 1, siteId: readStation.station_id }),
      null,
      null,
    ]);
    expect(response.json().paging).toEqual({ limit: 50, nextCursor: null, total: 3 });
    expect(response.json().data.map((row: { countryCode: string | null }) => row.countryCode)).toEqual(["PL", "DE", null]);
    expect(whereQuery("stations", "select").params).toEqual(expect.arrayContaining([1, 2, "DE"]));
  });

  it("adds the station with the location it is at now when the location is asked for on its own", async () => {
    scriptReaderAccess("user");
    dbMock.enqueueFor("select", "submissions", [
      { ...submissionRow, station_id: 1 },
      { ...submissionRow, id: foreignReaderId, station_id: 2 },
    ]);
    scriptSubmissionRead({ accessLoaded: true });
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      "stations",
      [
        { ...readStation, location_id: 1 },
        { ...readStation, id: 2 },
      ],
      [],
    );
    dbMock.enqueueFor("select", "extra_identificators", []);
    dbMock.enqueueFor("select", "locations", [readLocation]);
    const response = await injectMutation(route, { ...request, url: "/submissions?include=station.location" }, options);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.map((row: { station: unknown }) => row.station)).toEqual([
      expect.objectContaining({ id: 1, locationId: 1, location: expect.objectContaining({ id: 1, countryCode: "PL", regionId: 1, city: "Łódź" }) }),
      expect.objectContaining({ id: 2, locationId: null, location: null }),
    ]);
    expect(dbMock.calls.filter((call) => call.table === "locations")).toHaveLength(1);
  });

  it("allows an administrator's all view and explicit submitter filter without a geographic restriction", async () => {
    scriptReaderAccess("admin");
    dbMock.enqueueFor("select", "submissions", [submissionRow]);
    scriptSubmissionRead({ accessLoaded: true });
    const response = await injectMutation(
      route,
      { ...request, url: `/submissions?submitters=all&submitterIds=${submitterId}` },
      { session: userSession(foreignReaderId, "admin") },
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data[0].id).toBe(submissionRow.id);
    const filter = whereQuery("submissions", "select");
    expect(filter.params).toEqual([submitterId]);
    expect(filter.sql).not.toContain("EXISTS");
  });

  it.each(["user", "admin"] as const)("filters the %s view by countries and counts the same submissions", async (role) => {
    scriptReaderAccess(role);
    dbMock.enqueueFor("select", "submissions", [], [{ total: 0 }]);
    const response = await injectMutation(
      route,
      { ...request, url: `/submissions?countryCodes=PL,DE&includeTotal=true${role === "admin" ? "&submitters=all" : ""}` },
      { session: userSession(submitterId, role) },
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null, total: 0 } });
    const filter = whereQuery("submissions", "select");
    expect(filter.params).toEqual(role === "user" ? [submitterId, "PL", "DE"] : ["PL", "DE"]);
    expect(filter.sql).toContain(`"submissions"."submissions"."country_code" in (${role === "user" ? "$2, $3" : "$1, $2"})`);
    expect(filter.sql).not.toContain("COALESCE(");
    expect(filter.sql).not.toContain("SELECT");
    const queries = dbMock.calls.filter((call) => call.table === "submissions");
    expect(queries).toHaveLength(2);
    expect(queries[0]?.clauses.where?.[0]).toBe(queries[1]?.clauses.where?.[0]);
  });

  it.each([false, true])("uses the editor's region or whole-country grant for the all view: countryWide=%s", async (countryWide) => {
    scriptReaderAccess("editor", countryWide);
    dbMock.enqueueFor("select", "submissions", []);
    const response = await injectMutation(
      route,
      { ...request, url: "/submissions?submitters=all&countryCodes=DE" },
      { session: userSession(foreignReaderId, "editor") },
    );
    expect(response.statusCode, response.body).toBe(200);
    const filter = whereQuery("submissions", "select");
    expect(filter.sql).toContain('"proposed_stations"');
    expect(filter.sql).toContain('"proposed_locations"');
    expect(filter.params).toContain(countryWide ? "PL" : 1);
    expect(filter.params).toContain("new");
    expect(filter.params).toContain("DE");
    expect(filter.params).not.toContain(foreignReaderId);
  });

  it("prevents an editor with no grants from obtaining any all-view rows", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", []);
    const response = await injectMutation(
      route,
      { ...request, url: "/submissions?submitters=all" },
      { session: userSession(foreignReaderId, "editor") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
    expect(whereQuery("submissions", "select").sql).toContain("false");
  });

  it.each([
    "statuses=approved",
    "actions=new",
    "countryCodes=pl",
    "countryCodes=POL",
    "countryCodes=",
    "include=station.cells",
    "limit=201",
    "cursor=opaque&offset=0",
    "q=%20",
    "extra=1",
  ])("rejects unsupported list contracts before loading account access: %s", async (query) => {
    const response = await injectMutation(route, { ...request, url: `/submissions?${query}` }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("redacts a list database failure before proposal projections are loaded", async () => {
    scriptReaderAccess("user");
    dbMock.enqueueFor("select", "submissions", new Error("Private database credentials"));
    const response = await injectMutation(route, request, options);
    expectError(response, 500, "INTERNAL_SERVER_ERROR");
    expect(response.body).not.toContain("Private database credentials");
    expect(dbMock.calls.some((call) => call.table === "proposed_stations")).toBe(false);
  });

  it("rejects another submitter's filter on the owner's view", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(
      await injectMutation(route, { ...request, url: `/submissions?submitterIds=${submitterId}` }, options),
      400,
      "INVALID_QUERY",
      "submitterIds needs submitters=all",
    );
    expect(dbMock.calls.some((call) => call.table === "submissions")).toBe(false);
  });

  it("rejects listing everyone's submissions without staff permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    expectError(await injectMutation(route, { ...request, url: "/submissions?submitters=all" }, options), 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("restricts an editor's all view to their grant's stations and proposed locations", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 1 }]);
    dbMock.enqueueFor("select", "submissions", []);
    const response = await injectMutation(route, { ...request, url: "/submissions?submitters=all" }, { session: userSession(submitterId, "editor") });
    expect(response.statusCode).toBe(200);
    const condition = whereQuery("submissions", "select");
    expect(condition.sql).toContain('"proposed_locations"');
    expect(condition.sql).toContain('"stations"');
    expect(condition.params).toContain(1);
  });

  it("combines owner, status, action, operator, region and literal text filters and counts the same rows", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", [], [{ total: 0 }]);
    const response = await injectMutation(
      route,
      {
        ...request,
        url: "/submissions?statuses=accepted,rejected&actions=create,delete&operatorIds=7&regionIds=1&q=%25%5F&createdAfter=2026-01-01T00:00:00Z&includeTotal=true&sort=createdAt",
      },
      options,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paging: { total: 0 } });
    const condition = whereQuery("submissions", "select");
    expect(condition.params).toEqual(expect.arrayContaining([submitterId, "approved", "rejected", "new", "delete", 7, 1, "\\%\\_%", "%\\%\\_%"]));
    expect(dbMock.calls.filter((call) => call.table === "submissions").map((call) => call.clauses.where?.[0])).toEqual([
      expect.anything(),
      expect.anything(),
    ]);
  });

  it("returns only the requested page and accepts its cursor as the next offset", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", [submissionRow, { ...submissionRow, id: "22222222-2222-4222-8222-222222222222" }]);
    scriptSubmissionSerialization();
    const first = await injectMutation(route, { ...request, url: "/submissions?limit=1" }, options);
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toHaveLength(1);
    const cursor = first.json().paging.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    dbMock.enqueueFor("select", "submissions", []);
    const next = await injectMutation(route, { ...request, url: `/submissions?limit=1&cursor=${encodeURIComponent(String(cursor))}` }, options);
    expect(next.statusCode).toBe(200);
    expect(next.json()).toEqual({ data: [], paging: { limit: 1, nextCursor: null } });
    expect(dbMock.calls.findLast((call) => call.table === "submissions")?.clauses.offset).toEqual([1]);
  });

  it("rejects malformed cursors before loading account access", async () => {
    expectError(await injectMutation(route, { ...request, url: "/submissions?cursor=malformed" }, options), 400, "INVALID_QUERY");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires authentication before accessing submissions", async () => {
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns FEATURE_DISABLED when submissions are disabled", async () => {
    getRuntimeSettings().submissionsEnabled = false;
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the owner's empty submission list", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "submissions", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [] });
  });
});
