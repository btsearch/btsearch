import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import getUsers from "../../../../../src/routes/v2/(get)/users/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { readDate, readUserId } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getUsers", () => {
  it.each([true, false])("applies administrator email, role, id and ban filters with isBanned=%s", async (isBanned) => {
    dbMock.enqueueFor("select", "users", []);
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "admin") });
    const response = await app.inject({ url: `/users?q=example&ids=${readUserId}&roles=admin,editor&isBanned=${isBanned}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 25, nextCursor: null } });
    const where = dbMock.calls.find((call) => call.table === "users")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).toContain('"email"');
    expect(query.sql).toContain('"banned"');
    expect(query.sql).toContain("now()");
    expect(query.params).toEqual(expect.arrayContaining(["%example%", readUserId, "admin", "editor"]));
    expect(query.sql.includes("not ")).toBe(!isBanned);
  });

  it.each([
    { banned: true, banExpires: null, expected: true },
    { banned: true, banExpires: new Date("2026-10-07"), expected: true },
    { banned: true, banExpires: readDate, expected: false },
    { banned: false, banExpires: null, expected: false },
  ])("reports whether an account's ban remains in force: %j", async ({ banned, banExpires, expected }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(readDate);
    dbMock.enqueueFor(
      "select",
      "users",
      [{ id: readUserId, username: "tester", name: "Test User", image: null, key: "Test User" }],
      [
        {
          id: readUserId,
          email: "test@example.com",
          emailVerified: true,
          role: "admin",
          banned,
          banExpires,
          banReason: "Reason",
          createdAt: readDate,
        },
      ],
    );
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "admin") });
    const response = await app.inject({ url: "/users?include=account" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].account).toMatchObject({ isBanned: expected, banExpiresAt: banExpires?.toISOString() ?? null, role: "admin" });
  });

  it("does not query account details for an empty requested page", async () => {
    dbMock.enqueueFor("select", "users", []);
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "admin") });
    const response = await app.inject({ url: "/users?include=account" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 25, nextCursor: null } });
    expect(dbMock.calls).toHaveLength(1);
  });

  it("lets staff resolve explicit user ids without exposing account details", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", [{ id: readUserId, username: "tester", name: "Test User", image: null, key: "Test User" }]);
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "editor") });
    const response = await app.inject({ url: `/users?ids=${readUserId}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toEqual({ id: readUserId, username: "tester", name: "Test User", image: null });
    expect(dbMock.calls).toHaveLength(1);
  });

  it("returns a bounded page with administrator account details and expired bans", async () => {
    dbMock.enqueueFor(
      "select",
      "users",
      [{ id: readUserId, username: "tester", name: "Test User", image: null, key: "Test User" }],
      [{ total: 1 }],
      [
        {
          id: readUserId,
          email: "test@example.com",
          emailVerified: true,
          role: "legacy",
          banned: true,
          banExpires: new Date("2000-01-01"),
          banReason: "Expired",
          createdAt: readDate,
        },
      ],
    );
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "admin") });
    const response = await app.inject({ url: "/users?include=account&includeTotal=true&limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: readUserId, account: { role: "user", isBanned: false, email: "test@example.com", isEmailVerified: true } }],
      paging: { limit: 1, nextCursor: null, total: 1 },
    });
  });

  it("escapes search wildcards and prevents a staff search from accessing email", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "users", []);
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "editor") });
    const response = await app.inject({ url: "/users?q=100%25" });
    expect(response.statusCode).toBe(200);
    const where = dbMock.calls.find((call) => call.table === "users")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.sql).not.toContain('"email"');
    expect(query.params).toEqual(["%100\\%%", "%100\\%%"]);
  });

  it.each([
    ["", 403],
    ["q=x", 400],
    ["q=ok&include=account", 403],
    ["q=ok&roles=admin", 403],
    ["q=ok&isBanned=false", 403],
  ])("requires an administrator for privileged queries: %s", async (query, status) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(getUsers, { session: userSession(readUserId, "editor") });
    expect((await app.inject({ url: `/users?${query}` })).statusCode).toBe(status);
    expect(dbMock.calls).toHaveLength(0);
  });

  it("requires a signed-in account", async () => {
    const app = await createRouteHarness(getUsers);
    expect((await app.inject({ url: "/users?q=test" })).statusCode).toBe(401);
  });
});
