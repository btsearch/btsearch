import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/cells/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { prepareCellMove, writeCellMove } from "../../../../helpers/cellMoveFixtures.js";
import { cellBands, cellInputs, radioTables, storedCell } from "../../../../helpers/cellWriteFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow } from "../../../../helpers/stationFixtures.js";

function target(rat: keyof typeof cellInputs = "gsm") {
  const row = storedCell(cellInputs[rat]);
  const station = stationRow({ operator_id: null, location: null, sectors: [] });
  dbMock.enqueueFor("select", "cells", [row], [row]);
  dbMock.enqueueFor("select", "stations", [{ station, countryCode: null }], [{ locationCountry: null, operatorCountry: null }]);
  dbMock.enqueueFor("select", "bands", cellBands);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  return row;
}

describe("PATCH /cells/:id", () => {
  it("moves a cell, clears its old sector and follows both stations' cell counts", async () => {
    const fixture = prepareCellMove();
    writeCellMove(fixture);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { stationId: 2 } });
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject({ id: 11, stationId: 2, sectorId: null });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values).toMatchObject({
      station_id: 2,
      sector_id: null,
    });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date) },
      expect.objectContaining({ status: "pending" }),
      expect.objectContaining({ status: "published" }),
    ]);
    const audit = dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values);
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: "cells",
          station_id: 2,
          old_values: expect.objectContaining({ station_id: 1, sector_id: 5 }),
          new_values: expect.objectContaining({ station_id: 2, sector_id: null }),
        }),
        expect.objectContaining({ entity: "stations", record_id: "1", new_values: expect.objectContaining({ status: "pending" }) }),
        expect.objectContaining({ entity: "stations", record_id: "2", new_values: expect.objectContaining({ status: "published" }) }),
      ]),
    );
  });

  it("preserves the existing sector when stationId identifies the current station", async () => {
    const fixture = prepareCellMove({ destinationId: 1 });
    writeCellMove(fixture);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { stationId: 1 } });
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject({ stationId: 1, sectorId: 5 });
    const write = dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values;
    expect(write).not.toHaveProperty("station_id");
    expect(write).not.toHaveProperty("sector_id");
    expect(
      dbMock.calls.some(
        (call) => call.operation === "update" && call.table === "stations" && (call.values as { status?: string }).status !== undefined,
      ),
    ).toBe(false);
  });

  it.each(["missing", "hidden"] as const)("rejects a %s destination before opening a write transaction", async (kind) => {
    prepareCellMove({ [kind]: true });
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { stationId: 2 } });
    expect(response.statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("checks the destination operator's identity conflicts before moving a cell", async () => {
    prepareCellMove({ duplicate: true });
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { stationId: 2 } });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().errors[0].code).toBe("DUPLICATE_ENTRY");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });
  it.each(["gsm", "umts", "lte", "nr"] as const)("updates a %s cell's notes without changing its technology or station", async (rat) => {
    const previous = target(rat);
    const updated = { ...previous, cell: { ...previous.cell, notes: "Lorem ipsum dolor sit amet" } };
    const flat = (row: typeof previous) => ({ ...row.cell, gsm: row.gsm, umts: row.umts, lte: row.lte, nr: row.nr });
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([flat(previous)])
      .mockResolvedValueOnce([flat(previous)])
      .mockResolvedValue([flat(updated)]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("update", "cells", []);
    dbMock.enqueueFor("update", getTableName(radioTables[rat]), [previous.radio]);
    dbMock.enqueueFor("update", "stations", []);
    dbMock.enqueueFor("select", "cells", [], [updated]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
    dbMock.enqueueFor("select", "bands", cellBands);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { notes: "Lorem ipsum dolor sit amet" } });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject({ id: 11, rat, stationId: 1, notes: "Lorem ipsum dolor sit amet" });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values).toMatchObject({
      notes: "Lorem ipsum dolor sit amet",
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values).not.toHaveProperty("station_id");
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({
        entity: "cells",
        op: "update",
        record_id: "11",
        station_id: 1,
        old_values: expect.objectContaining({ notes: null }),
        new_values: expect.objectContaining({ notes: "Lorem ipsum dolor sit amet" }),
      }),
    ]);
  });

  it("returns 404 for an unknown cell", async () => {
    dbMock.enqueueFor("select", "cells", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/cells/11", payload: { notes: "new" } })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for a cell whose station cannot be read", async () => {
    dbMock.enqueueFor("select", "cells", [storedCell(cellInputs.gsm)]);
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/cells/11", payload: { notes: "new" } })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a field that does not apply to the stored technology", async () => {
    const row = storedCell(cellInputs.gsm);
    dbMock.enqueueFor("select", "cells", [row], [row]);
    dbMock.enqueueFor("select", "stations", [{ station: row.station, countryCode: null }]);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { enbid: 1 } });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("enbid does not apply");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("reports the radio field at the cell update body when stored details fail validation", async () => {
    const row = storedCell(cellInputs.gsm);
    const invalid = { ...row, gsm: { ...row.radio, bsic: 64 } };
    dbMock.enqueueFor("select", "cells", [invalid], [invalid]);
    dbMock.enqueueFor("select", "stations", [{ station: row.station, countryCode: null }]);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/cells/11", payload: { notes: "new" } });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().errors[0].code).toBe("VALIDATION_ERROR");
    expect(response.json().errors[0].details).toContainEqual(expect.objectContaining({ field: "bsic" }));
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects missing cell update permission before translating the cell", async () => {
    const row = storedCell(cellInputs.gsm);
    dbMock.enqueueFor("select", "cells", [row]);
    dbMock.enqueueFor("select", "stations", [{ station: row.station, countryCode: null }]);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/cells/11", payload: { notes: "new" } })).statusCode).toBe(403);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["empty update", {}],
    ["unknown field", { extra: true }],
    ["zero destination", { stationId: 0 }],
    ["invalid band", { bandId: -1 }],
    ["invalid sector", { sectorId: 0 }],
    ["non-boolean confirmation", { isConfirmed: "true" }],
    ["invalid BSIC", { bsic: 64 }],
    ["invalid PSC", { psc: 512 }],
    ["non-integer identifier", { cid: 1.5 }],
  ])("rejects %s before loading the cell", async (_name, payload) => {
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/cells/11", payload })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
