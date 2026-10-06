import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/stations/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../../../helpers/stationFixtures.js";

describe("DELETE /stations/:id", () => {
  it("deactivates an active station and records its complete previous state instead of deleting related data", async () => {
    const current = stationRow();
    const updated = stationRow({ status: "inactive" });
    visibleStation(current);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "stations", [current]);
    dbMock.enqueueFor("update", "stations", [updated]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "DELETE", url: "/stations/1" });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({
      status: "inactive",
      statusChangedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({ entity: "stations", op: "delete", old_values: current, new_values: updated, station_id: 1 }),
    ]);
    expect(dbMock.delete).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves an already inactive station unchanged without opening a transaction", async () => {
    visibleStation(stationRow({ status: "inactive" }));
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/stations/1" })).statusCode).toBe(204);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it.each([undefined, stationRow({ status: "inactive" })])(
    "handles a station removed or deactivated before the row lock as a no-op",
    async (locked) => {
      visibleStation();
      dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
      dbMock.enqueueFor("select", "stations", locked === undefined ? [] : [locked]);
      dbMock.enqueueFor("delete", "audit_operations", []);
      const app = await createRouteHarness(route, { session: userSession() });

      expect((await app.inject({ method: "DELETE", url: "/stations/1" })).statusCode).toBe(204);
      expect(dbMock.update).not.toHaveBeenCalled();
      expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
    },
  );

  it("returns 404 for an absent station", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/stations/1" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("hides a station in an inaccessible country", async () => {
    dbMock.enqueueFor("select", "stations", [{ station: stationRow(), countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/stations/1" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([[], new Error("database unavailable")])("does not report deactivation when updating the locked station fails (%j)", async (result) => {
    visibleStation();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "stations", [stationRow()]);
    dbMock.enqueueFor("update", "stations", result);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "DELETE", url: "/stations/1" });

    expect(response.statusCode).toBe(500);
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("rejects missing deletion permission before reading station state", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/stations/1" })).statusCode).toBe(403);
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992"])("rejects invalid station id %s before reading station state", async (id) => {
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: `/stations/${id}` })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
