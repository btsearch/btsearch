import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(delete)/stations/[id]/watch.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";

const ownerId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DELETE /stations/12/watch", () => {
  it("rejects a request without an account before reading or writing data", async () => {
    const response = await injectMutation(route, { method: "DELETE", url: "/stations/12/watch" });
    expectError(response, 401, "UNAUTHORIZED");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns the documented owner result", async () => {
    dbMock.enqueueFor("delete", "station_watches", []);
    const response = await injectMutation(route, { method: "DELETE", url: "/stations/12/watch" }, { session: userSession(ownerId, "user") });
    expect(response.statusCode).toBe(204);
    expect(whereQuery("station_watches", "delete").params).toEqual([ownerId, 12]);
    expect(response.body).toBe("");
  });

  it("keeps deletion idempotent when the resource is absent", async () => {
    dbMock.enqueueFor("delete", "station_watches", []);
    const response = await injectMutation(
      route,
      { method: "DELETE", url: "/stations/12/watch?unexpected=true" },
      { session: userSession(ownerId, "user") },
    );
    expect(response.statusCode).toBe(204);
  });
});
