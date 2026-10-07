import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(post)/lists/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  id: 1,
  uuid: "list-1",
  name: "Sites",
  description: null,
  is_public: false,
  notificationsEnabled: true,
  created_by: ownerId,
  stations: { internal: [12], uke: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "POST" as const, url: "/lists", payload: { name: " Sites ", items: { stationIds: [12, 12] } } };
const options = { session: userSession(ownerId) };

describe("POST /lists", () => {
  it.each([15, 16])("rejects creating a list when the owner already has %s lists", async (count) => {
    getRuntimeSettings().enableUserLists = true;
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor(
      "select",
      "user_lists",
      Array.from({ length: count }, (_, index) => ({ name: `List ${index}` })),
    );
    const response = await injectMutation(route, request, options);
    expectError(response, 400, "LIST_LIMIT_REACHED");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "user_lists")).toBe(false);
  });

  it("rejects a duplicate trimmed name before validating or inserting items", async () => {
    getRuntimeSettings().enableUserLists = true;
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", [{ name: "Sites" }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "You already have a list with this name");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "user_lists")).toBe(false);
  });

  it("reports missing ids separately for each item kind", async () => {
    getRuntimeSettings().enableUserLists = true;
    scriptAudit();
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
    dbMock.enqueueFor("select", "uke_stations", []);
    dbMock.enqueueFor("select", "uke_radiolines", []);
    const response = await injectMutation(
      route,
      { ...request, payload: { name: "Sites", items: { stationIds: [12], officialSiteIds: [24], microwaveLinkIds: [36] } } },
      options,
    );
    expectError(response, 400, "BAD_REQUEST", "Some of the items do not exist");
    expect(response.json()).toMatchObject({
      errors: [
        {
          details: [
            { field: "stationIds", ids: [12] },
            { field: "officialSiteIds", ids: [24] },
            { field: "microwaveLinkIds", ids: [36] },
          ],
        },
      ],
    });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "user_lists")).toBe(false);
  });

  it("returns FEATURE_DISABLED while lists are disabled", async () => {
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("requires an account after the feature is enabled", async () => {
    getRuntimeSettings().enableUserLists = true;
    const response = await injectMutation(route, request);
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.enqueueFor("select", "countries", []);
    scriptAudit();
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", [{ id: 12 }]);
    dbMock.enqueueFor("insert", "user_lists", [{ ...row, stations: { internal: [12], uke: [] }, radiolines: [] }]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: "list-1", isOwner: true, notificationsEnabled: true } });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "user_lists")?.values).toMatchObject({
      name: "Sites",
      stations: { internal: [12], uke: [] },
      radiolines: [],
    });
  });
});
