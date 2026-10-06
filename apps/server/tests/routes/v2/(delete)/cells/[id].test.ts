import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/cells/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellInputs, storedCell } from "../../../../helpers/cellWriteFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow } from "../../../../helpers/stationFixtures.js";

describe("DELETE /cells/:id", () => {
  it.each([
    ["published", 0, "pending"],
    ["published", 1, "published"],
    ["inactive", 0, "inactive"],
  ])("deletes a cell from a %s station with %s remaining cells and preserves the correct status", async (status, count, expectedStatus) => {
    const previous = storedCell(cellInputs.gsm);
    const station = stationRow({ status, operator_id: null, location: null, sectors: [] });
    dbMock.enqueueFor("select", "cells", [previous], [previous], [{ total: count }]);
    dbMock.enqueueFor("select", "stations", [{ station, countryCode: null }], [{ locationCountry: null, operatorCountry: null }]);
    dbMock.query.stations.findFirst.mockResolvedValue(station);
    dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
    dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
    dbMock.query.cells.findMany.mockResolvedValue([{ ...previous.cell, gsm: previous.gsm, umts: null, lte: null, nr: null }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("delete", "cells", []);
    dbMock.enqueueFor("update", "stations", expectedStatus === "pending" ? [stationRow({ status: "pending" })] : []);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "DELETE", url: "/cells/11" });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(204);
    expect(response.body).toBe("");
    expect(dbMock.calls.find((call) => call.operation === "delete" && call.table === "cells")).toBeDefined();
    const stationUpdate = dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values;
    if (expectedStatus === "pending") expect(stationUpdate).toMatchObject({ status: "pending", statusChangedAt: expect.any(Date) });
    else expect(stationUpdate).toEqual({ updatedAt: expect.any(Date) });
    const entries = dbMock.calls
      .filter((call) => call.operation === "insert" && call.table === "audit_logs")
      .flatMap((call) => call.values as unknown[]);
    expect(entries).toContainEqual(expect.objectContaining({ entity: "cells", op: "delete", record_id: "11", station_id: 1 }));
  });

  it("returns 404 for an unknown cell without mutating any station", async () => {
    dbMock.enqueueFor("select", "cells", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/cells/11" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing cell deletion permission before translating or deleting the cell", async () => {
    const row = storedCell(cellInputs.gsm);
    dbMock.enqueueFor("select", "cells", [row]);
    dbMock.enqueueFor("select", "stations", [{ station: row.station, countryCode: null }]);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/cells/11" })).statusCode).toBe(403);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("returns 404 when the cell disappears during translation", async () => {
    const row = storedCell(cellInputs.gsm);
    dbMock.enqueueFor("select", "cells", [row], []);
    dbMock.enqueueFor("select", "stations", [{ station: row.station, countryCode: null }]);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: "/cells/11" })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "abc", "9007199254740992"])("rejects invalid cell id %s before database access", async (id) => {
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "DELETE", url: `/cells/${id}` })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
