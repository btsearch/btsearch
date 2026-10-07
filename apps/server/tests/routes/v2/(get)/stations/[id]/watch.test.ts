import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/stations/[id]/watch.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function visibleStation() {
  dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "countries", []);
}

describe("GET /stations/:id/watch", () => {
  it("requires an account", async () => {
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/watch" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("hides a missing station before reading or creating watches", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/watch" }, { session: userSession(ownerId) });
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "station_watches")).toBe(false);
  });

  it("hides a station in a private country from an ordinary user", async () => {
    dbMock.enqueueFor("select", "stations", [{ station: { id: 12 }, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "users", [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", []);
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/watch" }, { session: userSession(ownerId) });
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "station_watches")).toBe(false);
  });

  it.each([false, true])("reports explicit watch membership as %s", async (watched) => {
    visibleStation();
    dbMock.enqueueFor("select", "station_watches", watched ? [{ id: 1 }] : []);
    const response = await injectMutation(route, { method: "GET", url: "/stations/12/watch" }, { session: userSession(ownerId) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { isWatched: watched } });
  });

  it.each(["0", "-1", "1.5", "no-station"])("rejects invalid station id %s before database access", async (id) => {
    const response = await injectMutation(route, { method: "GET", url: `/stations/${id}/watch` }, { session: userSession(ownerId) });
    expectError(response, 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
