import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { encodeCursor } from "../../../../../src/lib/cursor.js";
import route from "../../../../../src/routes/v2/(get)/comments/index.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { commentView } from "../../../../helpers/commentFixtures.js";
import { expectError, injectMutation, whereQuery } from "../../../../helpers/mutationAssertions.js";

describe("GET /comments", () => {
  it("restricts an editor's filtered ascending page to the regions in their grants", async () => {
    const actor = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 7 }]);
    dbMock.enqueueFor("select", "station_comments", [commentView, { ...commentView, id: "22222222-2222-4222-8222-222222222222" }]);
    const response = await injectMutation(
      route,
      { method: "GET", url: `/comments?q=%25_&authorIds=${actor}&statuses=pending&sort=createdAt&limit=1&cursor=${encodeCursor({ offset: 4 })}` },
      { session: userSession(actor, "editor") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ id: commentView.id }], paging: { limit: 1 } });
    expect(response.json().paging).not.toHaveProperty("total");
    expect(response.json().paging.nextCursor).toBe(encodeCursor({ offset: 5 }));
    const query = whereQuery("station_comments", "select");
    expect(query.params).toEqual(expect.arrayContaining([7, actor, "pending", "%\\%\\_%"]));
    const call = dbMock.calls.find((entry) => entry.table === "station_comments");
    expect(call?.clauses.offset).toEqual([4]);
    const direction = new PgDialect().sqlToQuery(call?.clauses.orderBy?.[0] as SQL);
    expect(direction.sql).toContain("asc");
  });

  it("reports an empty requested total while keeping the default descending order", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "station_comments", [], []);
    const response = await injectMutation(route, { method: "GET", url: "/comments?includeTotal=true" }, { session: userSession(undefined, "admin") });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, total: 0, nextCursor: null } });
  });

  it("requires an authenticated actor", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/comments" });
    expectError(response, 401, "UNAUTHORIZED");
  });

  it("lists pending comments for an administrator even while comments are disabled", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    dbMock.enqueueFor("select", "station_comments", [commentView], [{ total: 1 }]);
    const response = await injectMutation(
      route,
      { method: "GET", url: "/comments?includeTotal=true" },
      { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ status: "pending", author: { name: "Private Name" } }],
      paging: { limit: 50, total: 1, nextCursor: null },
    });
  });

  it("rejects malformed cursors before querying comments", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/comments?cursor=not-a-cursor" }, { session: userSession() });
    expectError(response, 400, "INVALID_QUERY");
    expect(dbMock.calls.some((call) => call.table === "station_comments")).toBe(false);
  });
});
