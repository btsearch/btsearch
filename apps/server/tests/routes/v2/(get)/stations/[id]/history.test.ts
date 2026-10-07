import { stations } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import getStationHistory from "../../../../../../src/routes/v2/(get)/stations/[id]/history.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { readDate, readStation, readUserId } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

describe("getStationHistory", () => {
  it("translates stored status changes and redacts authors and revert entry ids for guests", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "station_sectors", []);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor(
      "select",
      "audit_logs",
      [{ id: 5 }],
      [
        {
          id: 6,
          operation_id: 5,
          entity: "stations",
          op: "update",
          record_id: "1",
          station_id: 1,
          old_values: { status: "pending", notes: "Old" },
          new_values: { status: "published", notes: "New" },
          metadata: null,
        },
      ],
      [],
    );
    dbMock.enqueueFor(
      "select",
      "audit_operations",
      [],
      [
        {
          id: 5,
          createdAt: readDate,
          source: "api",
          kind: "station.update",
          actor_id: readUserId,
          country_code: "PL",
          reverted_by_operation_id: null,
          metadata: null,
        },
      ],
    );
    const app = await createRouteHarness(getStationHistory);
    const response = await app.inject({ url: "/stations/1/history" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 5,
          createdAt: readDate.toISOString(),
          source: "api",
          author: null,
          isRevert: false,
          changes: [
            {
              kind: "station",
              action: "update",
              revertStatus: "none",
              isRevertible: false,
              entryIds: [],
              fields: [
                { field: "status", from: "awaitingCells", to: "active" },
                { field: "notes", from: "Old", to: "New" },
              ],
            },
          ],
        },
      ],
      paging: { limit: 25, nextCursor: null },
    });
    expect(dbMock.calls.some((call) => call.table === "users")).toBe(false);
  });

  it("returns an empty history without loading unrelated audit operations", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "station_sectors", []);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    const app = await createRouteHarness(getStationHistory);
    const response = await app.inject({ url: "/stations/1/history?limit=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 1, nextCursor: null } });
    expect(dbMock.calls.some((call) => call.table === "audit_operations")).toBe(false);
  });

  it("rejects malformed history cursors before reading audit data", async () => {
    dbMock.enqueueFor("select", getTableName(stations), [{ station: readStation, countryCode: null }]);
    const app = await createRouteHarness(getStationHistory);
    expect((await app.inject({ url: "/stations/1/history?cursor=not-a-cursor" })).statusCode).toBe(400);
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it("distinguishes a missing station from an empty history", async () => {
    dbMock.enqueueFor("select", getTableName(stations), []);
    const app = await createRouteHarness(getStationHistory);
    expect((await app.inject({ url: "/stations/1/history" })).statusCode).toBe(404);
  });
});
