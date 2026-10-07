import { lteCells } from "@openbts/drizzle";
import type { NewCellInput } from "@openbts/shared/contract";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/cells/apply.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellBands, cellInputs, prepareCellChange, radioTables, storedCell, writeCreatedCells } from "../../../../helpers/cellWriteFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow } from "../../../../helpers/stationFixtures.js";

const lteTable = getTableName(lteCells);
const dialect = new PgDialect();

async function request(payload: unknown) {
  const errors: Error[] = [];
  const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
  const response = await app.inject({
    method: "POST",
    url: "/cells/apply",
    payload: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
  });
  return { response, errors };
}

function snapshot(row: ReturnType<typeof storedCell>) {
  const { cell, gsm, umts, lte, nr } = row;
  return { ...cell, gsm, umts, lte, nr };
}

function prepareLteUpdate(options: { oldTac?: number | null; operatorId?: number | null } = {}) {
  const old = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: options.oldTac ?? null }, 11);
  const station = stationRow({ operator_id: options.operatorId ?? null, location: null, sectors: [] });
  dbMock.enqueueFor("select", "stations", [{ station, countryCode: null }], [{ locationCountry: null, operatorCountry: null }], []);
  dbMock.enqueueFor("select", "cells", [old]);
  dbMock.enqueueFor("select", "bands", cellBands);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
  dbMock.query.cells.findMany.mockResolvedValue([snapshot(old)]);
  dbMock.enqueueFor("select", "station_watches", []);
  dbMock.enqueueFor("select", "user_lists", []);
  return old;
}

function writeLteUpdate(next: ReturnType<typeof storedCell>, listed = [next]) {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  dbMock.enqueueFor("update", "cells", []);
  dbMock.enqueueFor("update", lteTable, [next.radio]);
  dbMock.enqueueFor("update", "stations", []);
  dbMock.enqueueFor("select", "cells", [], listed);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "bands", cellBands);
}

function prepareBatch(items: { stationId: number; cells: NewCellInput[] }[], options: { operatorId?: number; missingStationId?: number } = {}) {
  const station = (id: number) => stationRow({ id, operator_id: options.operatorId ?? null, location: null, sectors: [] });
  for (const item of items)
    dbMock.enqueueFor(
      "select",
      "stations",
      item.stationId === options.missingStationId ? [] : [{ station: station(item.stationId), countryCode: null }],
    );
  for (const item of items) {
    dbMock.enqueueFor(
      "select",
      "bands",
      [...new Set(item.cells.map((cell) => cell.bandId))].map((id) => ({ id })),
    );
    dbMock.enqueueFor("select", "stations", [{ locationCountry: null, operatorCountry: null }]);
  }
  for (const item of items) {
    dbMock.enqueueFor("select", "bands", cellBands);
    if (options.operatorId && item.cells.some((cell) => cell.rat === "lte")) dbMock.enqueueFor("select", lteTable, []);
  }
  dbMock.query.stations.findFirst.mockImplementation(async (query) => station((query as { where: { id: number } }).where.id));
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationUplinks.findFirst.mockResolvedValue(undefined);
}

function writeBatch(items: { stationId: number; cells: NewCellInput[] }[], failStationId?: number) {
  const rows = items.flatMap((item, stationIndex) =>
    item.cells.map((input, index) => storedCell({ ...input, isConfirmed: true }, 11 + stationIndex * 10 + index, item.stationId)),
  );
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  for (const item of items) {
    const stationCells = rows.filter((row) => row.cell.station_id === item.stationId);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    for (const [index, row] of stationCells.entries()) {
      dbMock.enqueueFor("insert", "cells", item.stationId === failStationId ? [] : [row.cell]);
      dbMock.enqueueFor("insert", getTableName(radioTables[item.cells[index]!.rat]), [row.radio]);
    }
    dbMock.enqueueFor("select", "cells", [{ total: stationCells.length }], []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("update", "stations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
  }
  dbMock.query.cells.findMany.mockImplementation(async (query) => {
    const ids = (query as { where: { id: { in: number[] } } }).where.id.in;
    return rows.filter((row) => ids.includes(row.cell.id)).map(snapshot);
  });
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "cells", rows);
  dbMock.enqueueFor("select", "bands", cellBands);
}

describe("POST /cells/apply", () => {
  it.each(Object.entries(cellInputs))("creates and confirms a %s analyzer cell", async (rat, input) => {
    prepareCellChange([input]);
    writeCreatedCells([{ ...input, isConfirmed: true }]);
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "create", ...input }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject([{ stationId: 1, cells: [{ id: 11, rat, isConfirmed: true }] }]);
    expect(response.json().operationId).toBe(9);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
      kind: "analyzer.apply",
      metadata: { station_ids: [1] },
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual(
      expect.arrayContaining([expect.objectContaining({ metadata: { source: "analyzer" } })]),
    );
  });

  it("confirms an existing cell while preserving its unchanged TAC without spreading it", async () => {
    const old = prepareLteUpdate({ oldTac: 20 });
    const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: 20, isConfirmed: true }, 11);
    dbMock.enqueueFor("select", lteTable, [{ cellId: 11, tac: 20 }]);
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(next)]);
    writeLteUpdate(next);
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "update", id: 11, notes: "confirmed" }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data[0].cells[0]).toMatchObject({ id: 11, tac: 20, isConfirmed: true });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values).toMatchObject({
      is_confirmed: true,
      notes: "confirmed",
    });
    expect(dbMock.calls.filter((call) => call.operation === "select" && call.table === lteTable)).toHaveLength(1);
  });

  it("confirms an existing cell when the update names only its id", async () => {
    const old = prepareLteUpdate({ oldTac: 20 });
    const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: 20, isConfirmed: true }, 11);
    dbMock.enqueueFor("select", lteTable, [{ cellId: 11, tac: 20 }]);
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(next)]);
    writeLteUpdate(next);
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "update", id: 11 }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json()).toMatchObject({ data: [{ stationId: 1, cells: [{ id: 11, tac: 20, isConfirmed: true }] }], operationId: 9 });
    const written = dbMock.calls.find((call) => call.operation === "update" && call.table === "cells")?.values;
    expect(written).toMatchObject({ is_confirmed: true });
    expect(written).not.toHaveProperty("notes");
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs")).toHaveLength(1);
  });

  it("spreads a changed TAC to unsubmitted LTE cells on the same station and includes them in the result", async () => {
    const old = prepareLteUpdate({ oldTac: 10 });
    const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: 20, isConfirmed: true }, 11);
    const siblingOld = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 2, tac: 10, isConfirmed: true }, 12);
    const siblingNext = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 2, tac: 20, isConfirmed: true }, 12);
    dbMock.enqueueFor("select", lteTable, [{ cellId: 11, tac: 10 }], [{ cellId: 12 }]);
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(next)])
      .mockResolvedValueOnce([snapshot(siblingOld)])
      .mockResolvedValueOnce([snapshot(siblingNext)]);
    writeLteUpdate(next, [next, siblingNext]);
    dbMock.enqueueFor("update", lteTable, []);
    dbMock.enqueueFor("update", "cells", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "update", id: 11, tac: 20 }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data[0].cells).toMatchObject([
      { id: 11, tac: 20 },
      { id: 12, tac: 20 },
    ]);
    const spreadQuery = dbMock.calls.findLast((call) => call.operation === "select" && call.table === lteTable)!;
    const where = dialect.sqlToQuery(spreadQuery.clauses.where![0] as SQL);
    expect(where.sql).toContain("IS DISTINCT FROM");
    expect(where.params).toEqual(expect.arrayContaining([1, "LTE", 20]));
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === lteTable)).toHaveLength(2);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          record_id: "12",
          old_values: expect.objectContaining({ details: expect.objectContaining({ tac: 10 }) }),
          new_values: expect.objectContaining({ details: expect.objectContaining({ tac: 20 }) }),
        }),
      ]),
    );
  });

  it.each([
    ["empty request", []],
    ["over 50 stations", Array.from({ length: 51 }, (_, index) => ({ stationId: index + 1, cells: [{ action: "create", ...cellInputs.lte }] }))],
    ["empty station cells", [{ stationId: 1, cells: [] }]],
    [
      "repeated station",
      [
        { stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] },
        { stationId: 1, cells: [{ action: "create", ...cellInputs.gsm }] },
      ],
    ],
    [
      "repeated update",
      [
        {
          stationId: 1,
          cells: [
            { action: "update", id: 11, notes: "one" },
            { action: "update", id: 11, notes: "two" },
          ],
        },
      ],
    ],
    ["delete action", [{ stationId: 1, cells: [{ action: "delete", id: 11 }] }]],
    ["explicit unconfirmed creation", [{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte, isConfirmed: false }] }]],
    ["explicit sector key", [{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte, sectorKey: "new" }] }]],
    ["missing update ID", [{ stationId: 1, cells: [{ action: "update", notes: "one" }] }]],
    ["zero station", [{ stationId: 0, cells: [{ action: "create", ...cellInputs.lte }] }]],
    ["fractional station", [{ stationId: 1.5, cells: [{ action: "create", ...cellInputs.lte }] }]],
    ["unknown station field", [{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }], notes: "extra" }]],
  ])("rejects %s before any database call", async (_title, payload) => {
    const { response } = await request(payload);
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("points at the invalid field of an update with a value of the wrong type", async () => {
    const { response } = await request([{ stationId: 1, cells: [{ action: "update", id: 11, pci: "x" }] }]);
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].details).toEqual([
      { field: "0/cells/0/pci", validationMessage: "Invalid input: expected number, received string" },
    ]);
    expect(dbMock.calls).toEqual([]);
  });

  it("denies missing create or update permission before loading stations", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValueOnce({ success: false });
    const { response } = await request([{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] }]);
    expect(response.statusCode).toBe(403);
    expect(dbMock.calls).toEqual([]);
  });

  it("does not begin a transaction if a station is missing", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const { response } = await request([{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] }]);
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].details).toEqual([{ field: "0" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects an update for a cell absent from its station before writes", async () => {
    dbMock.enqueueFor("select", "stations", [{ station: stationRow({ operator_id: null }), countryCode: null }]);
    dbMock.enqueueFor("select", "cells", []);
    const { response } = await request([{ stationId: 1, cells: [{ action: "update", id: 999, tac: 10 }] }]);
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0]).toMatchObject({ message: "Cell 999 does not exist on this station", details: [{ field: "0" }] });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns no partial success when writing a confirmed cell fails", async () => {
    prepareCellChange([cellInputs.lte]);
    writeCreatedCells([{ ...cellInputs.lte, isConfirmed: true }], { failInsertAt: 0 });
    const { response } = await request([{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] }]);
    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_CREATE");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("omits cells no longer available in the post-commit serialization read", async () => {
    prepareCellChange([cellInputs.lte]);
    writeCreatedCells([{ ...cellInputs.lte, isConfirmed: true }], { missingListed: true });
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json()).toEqual({ data: [{ stationId: 1, cells: [] }], operationId: 9 });
  });

  it("writes stations in request order within one audited operation", async () => {
    const items = [
      { stationId: 2, cells: [cellInputs.lte] },
      { stationId: 1, cells: [cellInputs.gsm] },
    ];
    prepareBatch(items);
    writeBatch(items);
    const { response, errors } = await request(items.map((item) => ({ ...item, cells: item.cells.map((cell) => ({ action: "create", ...cell })) })));
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject([
      { stationId: 2, cells: [{ id: 11, rat: "lte", isConfirmed: true }] },
      { stationId: 1, cells: [{ id: 21, rat: "gsm", isConfirmed: true }] },
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_operations")).toHaveLength(1);
    expect(
      dbMock.calls
        .filter((call) => call.operation === "insert" && call.table === "cells")
        .map((call) => (call.values as { station_id: number }).station_id),
    ).toEqual([2, 1]);
  });

  it("prepares every station before starting writes when a later station is missing", async () => {
    const items = [
      { stationId: 1, cells: [cellInputs.lte] },
      { stationId: 2, cells: [cellInputs.gsm] },
    ];
    prepareBatch(items, { missingStationId: 2 });
    const { response } = await request(items.map((item) => ({ ...item, cells: item.cells.map((cell) => ({ action: "create", ...cell })) })));
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].details).toEqual([{ field: "1" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects an operator identity repeated across different stations before writes", async () => {
    const items = [
      { stationId: 1, cells: [cellInputs.lte] },
      { stationId: 2, cells: [cellInputs.lte] },
    ];
    prepareBatch(items, { operatorId: 7 });
    const { response, errors } = await request(items.map((item) => ({ ...item, cells: item.cells.map((cell) => ({ action: "create", ...cell })) })));
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(400);
    expect(response.json().errors[0].message).toContain("LTE");
    expect(response.json().errors[0].details).toEqual([{ field: "1/cells/0" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects two changed TAC values for one station before writes", async () => {
    const input = [
      { ...cellInputs.lte, rat: "lte" as const, enbid: 100, clid: 1, tac: 10 },
      { ...cellInputs.lte, rat: "lte" as const, enbid: 100, clid: 2, tac: 20 },
    ];
    prepareCellChange(input);
    const { response, errors } = await request([{ stationId: 1, cells: input.map((cell) => ({ action: "create", ...cell })) }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(400);
    expect(response.json().errors[0].message).toContain("Multiple TAC values");
    expect(response.json().errors[0].details).toEqual([{ field: "0" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns an error envelope when a later station fails instead of partial station results", async () => {
    const items = [
      { stationId: 1, cells: [cellInputs.lte] },
      { stationId: 2, cells: [cellInputs.gsm] },
    ];
    prepareBatch(items);
    writeBatch(items, 2);
    const { response } = await request(items.map((item) => ({ ...item, cells: item.cells.map((cell) => ({ action: "create", ...cell })) })));
    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("data");
    expect(response.json().errors[0].code).toBe("FAILED_TO_CREATE");
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_operations")).toHaveLength(1);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "cells")).toHaveLength(2);
  });
});
