import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(get)/lists/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";
import { scriptAdminVisibility, scriptGuestVisibility, scriptUserVisibility } from "../../../../helpers/officialDataFixtures.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  id: 1,
  uuid: "list-1",
  name: "Sites",
  description: null,
  is_public: false,
  notificationsEnabled: true,
  created_by: ownerId,
  stations: { internal: [12], official: [24] },
  radiolines: [36],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const request = { method: "GET" as const, url: "/lists/list-1" };
const options = { session: userSession(ownerId) };

describe("GET /lists/list-1", () => {
  it("returns FEATURE_DISABLED while lists are disabled", async () => {
    const response = await injectMutation(route, request, options);
    expectError(response, 403, "FEATURE_DISABLED");
    expect(dbMock.calls).toEqual([]);
  });

  it("allows guests to read a public list while hiding owner preferences", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ ...row, is_public: true });
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", [{ id: 24, operatorId: 3 }]);
    dbMock.enqueueFor("select", "official.microwave_links", [{ id: 36 }]);
    const response = await injectMutation(route, request);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: "list-1", isOwner: false, notificationsEnabled: null } });
  });

  it("leaves out of a guest's counts and items the official sites and microwave links of hidden sources", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ ...row, is_public: true });
    scriptGuestVisibility([1]);
    dbMock.enqueueFor("select", "official.sites", []);
    dbMock.enqueueFor("select", "official.microwave_links", []);
    const response = await injectMutation(route, { ...request, url: "/lists/list-1?include=items" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      itemCounts: { stations: 1, officialSites: 0, microwaveLinks: 0 },
      items: { stationIds: [12], officialSiteIds: [], microwaveLinkIds: [] },
    });
    expect(whereQuery("official.sites", "select").sql).toContain('"public_location"."source_id" in');
    expect(whereQuery("official.microwave_links", "select").sql).toContain('"link_dataset"."source_id" in');
  });

  it("hides another person's private list from guests and ordinary users", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    scriptUserVisibility();
    const response = await injectMutation(route, request, { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") });
    expectError(response, 404, "NOT_FOUND");
  });

  it("rejects disclosing a public list's owner without read-all permission", async () => {
    getRuntimeSettings().enableUserLists = true;
    dbMock.query.userLists.findFirst.mockResolvedValue({ ...row, is_public: true });
    scriptUserVisibility();
    const response = await injectMutation(
      route,
      { ...request, url: "/lists/list-1?include=owner" },
      { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") },
    );
    expectError(response, 403, "INSUFFICIENT_PERMISSIONS");
  });

  it("returns the documented owner result", async () => {
    getRuntimeSettings().enableUserLists = true;
    scriptAdminVisibility();
    dbMock.query.userLists.findFirst.mockResolvedValue(row);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: "list-1", isOwner: true, notificationsEnabled: true } });
  });
});
