import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(patch)/lists/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
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
const request = { method: "PATCH" as const, url: "/lists/list-1", payload: { items: { stationIds: [] } } };
const options = { session: userSession(ownerId) };

function prepareOwnedListUpdate(): void {
  getRuntimeSettings().enableUserLists = true;
  scriptAudit();
  dbMock.query.userLists.findFirst.mockResolvedValue(row);
  dbMock.enqueueFor("select", "countries", []);
}

describe("PATCH /lists/list-1", () => {
  it.each([{ description: "A description" }, { description: "" }, { description: undefined }])(
    "updates only supplied metadata without replacing stored memberships: %j",
    async ({ description }) => {
      prepareOwnedListUpdate();
      dbMock.enqueueFor("select", "user_lists", [row]);
      dbMock.enqueueFor("update", "user_lists", [row]);
      const response = await injectMutation(
        route,
        {
          ...request,
          payload: { name: "Sites", isPublic: true, notificationsEnabled: false, ...(description === undefined ? {} : { description }) },
        },
        options,
      );
      expect(response.statusCode).toBe(200);
      expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "user_lists")?.values).toMatchObject({
        description: description === undefined ? undefined : description || null,
        stations: undefined,
        radiolines: undefined,
        is_public: true,
        notificationsEnabled: false,
      });
      expect(dbMock.calls.filter((call) => call.operation === "select" && call.table === "user_lists")).toHaveLength(1);
    },
  );

  it("renames a list after checking the owner's other list names", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row], []);
    dbMock.enqueueFor("update", "user_lists", [{ ...row, name: "Other sites" }]);
    const response = await injectMutation(route, { ...request, payload: { name: "  Other sites  " } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { name: "Other sites" } });
  });

  it("rejects an existing name before changing memberships", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row], [{ id: 2 }]);
    expectError(
      await injectMutation(route, { ...request, payload: { name: "Other sites" } }, options),
      409,
      "CONFLICT",
      "The owner already has a list with this name",
    );
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "user_lists")).toBe(false);
  });

  it("adds and removes each membership type while preserving untouched and existing items", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row]);
    dbMock.enqueueFor("select", "stations", [{ id: 13 }]);
    dbMock.enqueueFor("select", "uke_stations", [{ id: 25 }]);
    dbMock.enqueueFor("select", "uke_radiolines", [{ id: 37 }]);
    dbMock.enqueueFor("update", "user_lists", [{ ...row, stations: { internal: [13], uke: [24, 25] }, radiolines: [37] }]);
    const response = await injectMutation(
      route,
      {
        ...request,
        payload: {
          addItems: { stationIds: [13], officialSiteIds: [25], microwaveLinkIds: [37] },
          removeItems: { stationIds: [12], microwaveLinkIds: [36] },
        },
      },
      options,
    );
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "user_lists")?.values).toMatchObject({
      stations: { internal: [13], uke: [24, 25] },
      radiolines: [37],
    });
  });

  it("reports missing newly added items without saving the list", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row]);
    dbMock.enqueueFor("select", "stations", []);
    const response = await injectMutation(route, { ...request, payload: { addItems: { stationIds: [13] } } }, options);
    expectError(response, 400, "BAD_REQUEST", "Some of the items do not exist");
    expect(response.json().errors[0].details).toEqual([{ field: "stationIds", ids: [13] }]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "user_lists")).toBe(false);
  });

  it("returns 404 if the list disappears before its row can be locked", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", []);
    expectError(await injectMutation(route, request, options), 404, "NOT_FOUND");
  });

  it("fails without an audit entry when saving returns no list", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row]);
    dbMock.enqueueFor("update", "user_lists", []);
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("returns a controlled failure when the database transaction rejects", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "countries", []);
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
  });

  it.each([{ items: {}, addItems: {} }, { items: {}, removeItems: {} }, { addItems: { stationIds: [12] }, removeItems: { stationIds: [12] } }, {}])(
    "rejects contradictory or empty item changes before database access: %j",
    async (payload) => {
      getRuntimeSettings().enableUserLists = true;
      const response = await injectMutation(route, { ...request, payload }, options);
      expectError(response, 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("does not require previously stored ids to still exist when replacing membership", async () => {
    prepareOwnedListUpdate();
    dbMock.enqueueFor("select", "user_lists", [row]);
    dbMock.enqueueFor("update", "user_lists", [row]);
    const response = await injectMutation(route, { ...request, payload: { items: { stationIds: [12] } } }, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.some((call) => call.table === "stations")).toBe(false);
  });

  it("rejects changing another user's public list without manage-all permission", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ ...row, is_public: true });
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const response = await injectMutation(route, request, { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") });
    expectError(response, 403, "FORBIDDEN");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
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
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "user_lists", [row]);
    dbMock.enqueueFor("update", "user_lists", [{ ...row, stations: { internal: [], uke: [24] } }]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: "list-1", isOwner: true, notificationsEnabled: true } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "user_lists")?.values).toMatchObject({
      stations: { internal: [], uke: [24] },
      radiolines: [36],
    });
  });
});
