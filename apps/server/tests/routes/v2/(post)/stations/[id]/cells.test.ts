import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/stations/[id]/cells.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { cellBands, cellInputs, prepareCellChange, radioTables, writeCreatedCells } from "../../../../../helpers/cellWriteFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

async function request(payload: unknown, url = "/stations/1/cells") {
  const errors: Error[] = [];
  const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
  const response = await app.inject({ method: "POST", url, payload: JSON.stringify(payload), headers: { "content-type": "application/json" } });
  return { response, errors };
}

describe("POST /stations/:id/cells", () => {
  it.each(Object.entries(cellInputs))("creates a %s cell through the audited write and returns the public contract", async (rat, input) => {
    prepareCellChange([input]);
    const [stored] = writeCreatedCells([input]);
    const { response, errors } = await request([input]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(201);
    expect(response.json().data).toMatchObject([{ id: stored!.cell.id, stationId: 1, bandId: input.bandId, rat, isConfirmed: false }]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "cells")?.values).toMatchObject({
      station_id: 1,
      rat: rat.toUpperCase(),
      is_confirmed: false,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === getTableName(radioTables[input.rat]))?.values).toMatchObject({
      cell_id: stored!.cell.id,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity: "cells", op: "create", record_id: String(stored!.cell.id) })]),
    );
  });

  it("returns multiple radio technologies in the submitted order", async () => {
    const input = [cellInputs.lte, cellInputs.gsm];
    prepareCellChange(input);
    writeCreatedCells(input);
    const { response, errors } = await request(input);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(201);
    expect(response.json().data.map((cell: { rat: string }) => cell.rat)).toEqual(["lte", "gsm"]);
  });

  it("activates an awaiting-cells station and records the status change", async () => {
    prepareCellChange([cellInputs.lte], { status: "pending" });
    writeCreatedCells([cellInputs.lte], { status: "pending" });
    const { response, errors } = await request([cellInputs.lte]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({ status: "published" });
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity: "stations", op: "update" })]),
    );
  });

  it("preserves an inactive station status when adding a cell", async () => {
    prepareCellChange([cellInputs.lte], { status: "inactive" });
    writeCreatedCells([cellInputs.lte]);
    const { response, errors } = await request([cellInputs.lte]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(201);
    expect(
      dbMock.calls
        .filter((call) => call.operation === "update" && call.table === "stations")
        .every((call) => !("status" in (call.values as Record<string, unknown>))),
    ).toBe(true);
  });

  it("assigns a known station sector and preserves explicit confirmation", async () => {
    const input = { ...cellInputs.lte, sectorId: 5, isConfirmed: true };
    prepareCellChange([input], { sectors: [{ id: 5, azimuth: 120 }] });
    writeCreatedCells([input]);
    const { response, errors } = await request([input]);
    expect(response.statusCode, errors.map((error) => error.stack).join("\n")).toBe(201);
    expect(response.json().data[0]).toMatchObject({ sectorId: 5, isConfirmed: true });
  });

  it.each([
    ["empty batch", []],
    ["batch over 200", Array.from({ length: 201 }, () => cellInputs.lte)],
    ["unsupported RAT", [{ ...cellInputs.lte, rat: "wifi" }]],
    ["wrong RAT fields", [{ ...cellInputs.gsm, enbid: 1 }]],
    ["missing LTE identity", [{ rat: "lte", bandId: 3 }]],
    ["fractional band", [{ ...cellInputs.lte, bandId: 1.5 }]],
    ["zero band", [{ ...cellInputs.lte, bandId: 0 }]],
    ["negative CLID", [{ ...cellInputs.lte, clid: -1 }]],
    ["string PCI", [{ ...cellInputs.lte, pci: "504" }]],
    ["two sector selectors", [{ ...cellInputs.lte, sectorId: 1, sectorKey: "sector" }]],
    ["string confirmation", [{ ...cellInputs.lte, isConfirmed: "true" }]],
  ])("rejects %s before any database call", async (_title, payload) => {
    const { response } = await request(payload);
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects station ID %s before writes", async (id) => {
    const { response } = await request([cellInputs.lte], `/stations/${id}/cells`);
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an unsupported include before writes", async () => {
    const { response } = await request([cellInputs.lte], "/stations/1/cells?include=unknown");
    expect(response.statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });

  it("returns not found when the station does not exist", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const { response } = await request([cellInputs.lte]);
    expect(response.statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("denies a user lacking cell creation permission before preparing a write", async () => {
    prepareCellChange([cellInputs.lte]);
    authBoundary.auth.api.userHasPermission.mockResolvedValueOnce({ success: false });
    const { response } = await request([cellInputs.lte]);
    expect(response.statusCode).toBe(403);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["foreign sector", { ...cellInputs.lte, sectorId: 99 }],
    ["sector key without a new sector", { ...cellInputs.lte, sectorKey: "new-sector" }],
  ])("rejects %s before the transaction", async (_title, input) => {
    prepareCellChange([input]);
    const { response } = await request([input]);
    expect(response.statusCode).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects duplicate identities in one batch before any cell insert", async () => {
    prepareCellChange([cellInputs.lte, cellInputs.lte]);
    const { response } = await request([cellInputs.lte, cellInputs.lte]);
    expect(response.statusCode).toBe(400);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["a band missing from storage", []],
    ["a band for another technology", [{ ...cellBands[2]!, rat: "NR" }]],
  ])("rejects %s before the transaction", async (_title, bands) => {
    prepareCellChange([cellInputs.lte], { bands });
    const { response } = await request([cellInputs.lte]);
    expect(response.statusCode).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a band outside the station country's plan", async () => {
    prepareCellChange([cellInputs.lte], { countryCode: "PL" });
    const { response } = await request([cellInputs.lte]);
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("band plan of PL");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects an EARFCN that cannot belong to the chosen LTE band", async () => {
    const input = { ...cellInputs.lte, earfcn: 0 };
    prepareCellChange([input], { bands: cellBands });
    const { response } = await request([input]);
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("EARFCN 0");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects a known base-station ID paired with an unknown cell ID", async () => {
    const input = { ...cellInputs.lte, clid: null };
    prepareCellChange([input]);
    const { response } = await request([input]);
    expect(response.statusCode).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("reports the public array path for radio-specific validation errors", async () => {
    const input = { ...cellInputs.lte, pci: 504 };
    prepareCellChange([input]);
    const { response } = await request([input]);
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0]).toMatchObject({ code: "VALIDATION_ERROR", details: [{ field: "0/pci" }] });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("does not publish a partial response when a later cell write fails", async () => {
    const input = [cellInputs.lte, cellInputs.gsm];
    prepareCellChange(input);
    writeCreatedCells(input, { failInsertAt: 1 });
    const { response } = await request(input);
    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("data");
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "cells")).toHaveLength(2);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(false);
  });

  it("stops after a cell insert returns no row and never returns partial success", async () => {
    const input = [cellInputs.lte, cellInputs.gsm];
    prepareCellChange(input);
    writeCreatedCells(input, { failInsertAt: 0 });
    const { response } = await request(input);
    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_CREATE");
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "cells")).toHaveLength(1);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs")).toEqual([]);
  });

  it("fails the operation when the created cell cannot be read for the audit snapshot", async () => {
    prepareCellChange([cellInputs.lte]);
    writeCreatedCells([cellInputs.lte], { missingSnapshot: true });
    const { response } = await request([cellInputs.lte]);
    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_UPDATE");
  });
});
