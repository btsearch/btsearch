import { lteCells } from "@openbts/drizzle";
import type { NewCellInput } from "@openbts/shared/contract";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { raiseRenumberedFlag } from "../../../../../src/features/observed/flags/sites/renumbered.js";
import route from "../../../../../src/routes/v2/(post)/cells/apply.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellBands, cellInputs, prepareCellChange, radioTables, storedCell, writeCreatedCells } from "../../../../helpers/cellWriteFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { BIALYSTOK, siteRecord } from "../../../../helpers/siteRecordFixtures.js";
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

function prepareLteUpdate(options: { oldTac?: number | null; operatorId?: number | null; countryCode?: string; tools?: string[] } = {}) {
  const old = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: options.oldTac ?? null }, 11);
  const station = stationRow({ operator_id: options.operatorId ?? null, location: null, sectors: [] });
  const countryCode = options.countryCode ?? "PL";
  dbMock.enqueueFor("select", "stations", [{ station, countryCode }], [{ locationCountry: null, operatorCountry: null }], []);
  dbMock.enqueueFor("select", "countries", [], [{ tools: options.tools ?? ["analyzer"] }]);
  dbMock.enqueueFor("select", "cells", [old]);
  dbMock.enqueueFor("select", "bands", cellBands);
  dbMock.query.stations.findFirst.mockResolvedValue(station);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
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

function prepareBatch(
  items: { stationId: number; cells: NewCellInput[] }[],
  options: { operatorId?: number; missingStationId?: number; countryCode?: string } = {},
) {
  const station = (id: number) => stationRow({ id, operator_id: options.operatorId ?? null, location: null, sectors: [] });
  for (const item of items)
    dbMock.enqueueFor(
      "select",
      "stations",
      item.stationId === options.missingStationId ? [] : [{ station: station(item.stationId), countryCode: options.countryCode ?? null }],
    );
  if (options.countryCode) dbMock.enqueueFor("select", "countries", ...items.map(() => []), ...items.map(() => [{ tools: ["analyzer"] }]));
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
  dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
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
    const writeStart = dbMock.calls.findIndex((call) => call.operation === "insert" && call.table === "audit_operations");
    expect(dbMock.calls.slice(0, writeStart).filter((call) => call.operation === "select" && call.table === "cell_plmns")).toHaveLength(1);
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
    expect(dialect.sqlToQuery(spreadQuery.clauses.where![0] as SQL).params).toEqual(expect.arrayContaining([1, "LTE", 20]));
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

  it("writes a changed TAC only to its own cell in a country where cells do not share a station TAC", async () => {
    const old = prepareLteUpdate({ oldTac: 10, countryCode: "DE" });
    const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: 20, isConfirmed: true }, 11);
    dbMock.query.cells.findMany
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(old)])
      .mockResolvedValueOnce([snapshot(next)]);
    writeLteUpdate(next);
    const { response, errors } = await request([{ stationId: 1, cells: [{ action: "update", id: 11, tac: 20 }] }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data[0].cells).toMatchObject([{ id: 11, tac: 20 }]);
    expect(dbMock.calls.filter((call) => call.operation === "select" && call.table === lteTable)).toHaveLength(0);
    const lteUpdates = dbMock.calls.filter((call) => call.operation === "update" && call.table === lteTable);
    expect(lteUpdates.map((call) => call.values)).toMatchObject([{ tac: 20 }]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toHaveLength(1);
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

  it("refuses a station in a country with the analyzer off before writes", async () => {
    dbMock.enqueueFor("select", "stations", [{ station: stationRow({ operator_id: null }), countryCode: "DE" }]);
    dbMock.enqueueFor("select", "countries", [], [{ tools: ["measurements"] }]);
    const { response } = await request([{ stationId: 1, cells: [{ action: "create", ...cellInputs.lte }] }]);
    expect(response.statusCode).toBe(403);
    expect(response.json().errors[0]).toMatchObject({
      code: "FEATURE_DISABLED",
      message: "The analyzer is switched off in DE",
      details: [{ field: "0" }],
    });
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
    expect(response.json()).toEqual({ data: [{ stationId: 1, cells: [], closedObservationFlagIds: [] }], operationId: 9 });
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
    prepareBatch([{ stationId: 1, cells: input }], { countryCode: "PL" });
    const { response, errors } = await request([{ stationId: 1, cells: input.map((cell) => ({ action: "create", ...cell })) }]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(400);
    expect(response.json().errors[0].message).toContain("Multiple TAC values");
    expect(response.json().errors[0].details).toEqual([{ field: "0" }]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("keeps two different new TACs for one station in a country where cells do not share a station TAC", async () => {
    const items = [
      {
        stationId: 1,
        cells: [
          { ...cellInputs.lte, rat: "lte" as const, enbid: 100, clid: 1, tac: 10 },
          { ...cellInputs.lte, rat: "lte" as const, enbid: 100, clid: 2, tac: 20 },
        ],
      },
    ];
    prepareBatch(items, { countryCode: "DE" });
    writeBatch(items);
    const { response, errors } = await request(items.map((item) => ({ ...item, cells: item.cells.map((cell) => ({ action: "create", ...cell })) })));
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
    expect(response.json().data[0].cells).toMatchObject([
      { id: 11, tac: 10 },
      { id: 12, tac: 20 },
    ]);
    const lteInserts = dbMock.calls.filter((call) => call.operation === "insert" && call.table === lteTable);
    expect(lteInserts.map((call) => call.values)).toMatchObject([{ tac: 10 }, { tac: 20 }]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === lteTable)).toBe(false);
  });

  describe("with observationFlagIds", () => {
    const flag = { id: 4101, kind: "valueDiffers", stationId: 1, closedReason: null, observedCellId: 50411, observedSiteId: 9205 };
    const secondFlag = { ...flag, id: 4102, observedCellId: 50412 };
    const fix = [{ stationId: 1, observationFlagIds: [4101, 4102], cells: [{ action: "update", id: 11, pci: 301 }] }];

    function flagWrites() {
      return dbMock.calls.filter((call) => call.operation !== "select" && (call.table === "observation_flags" || call.table === "match_queue"));
    }

    function cellWrites() {
      return dbMock.calls.filter((call) => call.operation !== "select" && (call.table === "cells" || call.table === lteTable));
    }

    it("closes the station's flags in its operation, names them there and in the answer, and queues their observed cells, where only measurements are on", async () => {
      const old = prepareLteUpdate({ oldTac: 20, countryCode: "DE", tools: ["measurements"] });
      const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 100, clid: 1, tac: 20, pci: 301, isConfirmed: true }, 11);
      dbMock.query.cells.findMany
        .mockResolvedValueOnce([snapshot(old)])
        .mockResolvedValueOnce([snapshot(old)])
        .mockResolvedValueOnce([snapshot(next)]);
      dbMock.enqueueFor("select", lteTable, [], []);
      dbMock.enqueueFor("select", "observation_flags", [flag, secondFlag]);
      dbMock.enqueueFor("update", "observation_flags", []);
      dbMock.enqueueFor("insert", "match_queue", []);
      writeLteUpdate(next);

      const { response, errors } = await request(fix);

      expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
      expect(response.json().data).toMatchObject([{ stationId: 1, closedObservationFlagIds: [4101, 4102] }]);
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_operations")?.values).toMatchObject({
        kind: "analyzer.apply",
        metadata: { station_ids: [1], observation_flag_ids: [4101, 4102] },
      });
      expect(flagWrites().map((call) => [call.operation, call.table, call.values])).toMatchObject([
        ["update", "observation_flags", { closedReason: "applied", resolvedById: userSession().user.id, suggestion: null }],
        ["insert", "match_queue", [{ observedCellId: 50411 }, { observedCellId: 50412 }]],
      ]);
    });

    it("applies a renumbered flag's suggestion as the flag holds it, and queues the cells of its site", async () => {
      const previous = siteRecord({ id: 6120, nodeId: 100, status: "matched", matchedStationId: 1, lastSeenOn: "2026-10-01" });
      const renumbered = raiseRenumberedFlag(
        siteRecord({ id: 7310, nodeId: 24494, firstSeenOn: "2026-10-03" }),
        [{ observedCellId: 51001, cellKey: 24494 * 256 + 2, channel: 1850, pci: 101 }],
        [{ previous, stationId: 1, station: BIALYSTOK, cells: [{ cellId: 11, clid: 1, channel: 1850, pci: 101 }] }],
        { quietBefore: "2026-10-11" },
      );
      const old = prepareLteUpdate({ oldTac: 20, countryCode: "DE", tools: ["measurements"] });
      const next = storedCell({ ...cellInputs.lte, rat: "lte", enbid: 24494, clid: 2, tac: 20, isConfirmed: true }, 11);
      dbMock.query.cells.findMany
        .mockResolvedValueOnce([snapshot(old)])
        .mockResolvedValueOnce([snapshot(old)])
        .mockResolvedValueOnce([snapshot(next)]);
      dbMock.enqueueFor("select", lteTable, [], []);
      dbMock.enqueueFor("select", "observation_flags", [{ ...flag, id: 4120, kind: "renumbered", observedCellId: null, observedSiteId: 7310 }]);
      dbMock.enqueueFor("update", "observation_flags", []);
      dbMock.enqueueFor("select", "observed_cells", [{ id: 51001 }]);
      dbMock.enqueueFor("insert", "match_queue", []);
      writeLteUpdate(next);

      const { response, errors } = await request([{ stationId: 1, cells: renumbered?.suggestion.cells, observationFlagIds: [4120] }]);

      expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(200);
      expect(renumbered?.suggestion.cells).toEqual([{ action: "update", id: 11, enbid: 24494, clid: 2 }]);
      expect(flagWrites().map((call) => [call.operation, call.table, call.values])).toMatchObject([
        ["update", "observation_flags", { closedReason: "applied" }],
        ["insert", "match_queue", [{ observedCellId: 51001 }]],
      ]);
    });

    it.each([
      ["a flag of another station", [flag, { ...secondFlag, stationId: 2 }], 400, "BAD_REQUEST", "Flag 4102 is about another station"],
      ["a flag that does not exist", [flag], 404, "NOT_FOUND", "Flag 4102 does not exist"],
      [
        "a flag of a kind this request does not apply",
        [flag, { ...secondFlag, kind: "bandNotInPlan" }],
        400,
        "BAD_REQUEST",
        "A bandNotInPlan flag is not applied with this request",
      ],
    ])("refuses %s and writes nothing", async (_title, stored, statusCode, code, message) => {
      prepareLteUpdate({ oldTac: 20, countryCode: "DE", tools: ["measurements"] });
      dbMock.enqueueFor("select", lteTable, []);
      dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
      dbMock.enqueueFor("select", "observation_flags", stored);

      const { response } = await request(fix);

      expect(response.statusCode).toBe(statusCode);
      expect(response.json().errors[0]).toMatchObject({ code, message, details: [{ field: "0/observationFlagIds/1" }] });
      expect(flagWrites()).toEqual([]);
      expect(cellWrites()).toEqual([]);
    });

    it("fails the whole request when flags closed meanwhile, and names each of them with why it closed", async () => {
      prepareLteUpdate({ oldTac: 20, countryCode: "DE", tools: ["measurements"] });
      dbMock.enqueueFor("select", lteTable, []);
      dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
      dbMock.enqueueFor("select", "observation_flags", [
        { ...flag, closedReason: "fixedElsewhere" },
        { ...secondFlag, closedReason: "dismissed" },
      ]);

      const { response } = await request(fix);

      expect(response.statusCode).toBe(409);
      expect(response.json().errors[0]).toMatchObject({ code: "CONFLICT", message: "Flags 4101, 4102 are no longer open" });
      expect(response.json().errors[0].details).toEqual([
        { kind: "flagClosed", field: "0/observationFlagIds/0", observationFlagId: 4101, closedReason: "fixedElsewhere" },
        { kind: "flagClosed", field: "0/observationFlagIds/1", observationFlagId: 4102, closedReason: "dismissed" },
      ]);
      expect(flagWrites()).toEqual([]);
      expect(cellWrites()).toEqual([]);
    });

    it("refuses flags from someone without moderate:observations before loading anything", async () => {
      authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => ({ success: !JSON.stringify(input).includes("moderate") }));

      const { response } = await request(fix);

      expect(response.statusCode).toBe(403);
      expect(response.json().errors[0]).toMatchObject({ code: "INSUFFICIENT_PERMISSIONS" });
      expect(dbMock.calls).toEqual([]);
    });
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
