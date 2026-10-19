import { gsmCells, lteCells, umtsCells } from "@openbts/drizzle";
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(post)/stations/index.js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellBands, cellInputs, storedCell } from "../../../../helpers/cellWriteFixtures.js";
import { whereQuery } from "../../../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../../../helpers/stationFixtures.js";

const payload = { station: { siteId: "A1", operatorId: 1 } };
const SITE_ID_NEEDED =
  "A station needs a station number unless it has a cell that names it: an LTE cell with an eNB, an NR cell with a gNB, a UMTS cell with an RNC or a GSM cell with a LAC";

describe("POST /stations", () => {
  it("creates a confirmed station awaiting cells without requiring a location or a photo", async () => {
    const saved = stationRow({ status: "pending" });
    dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
    dbMock.query.stations.findFirst.mockResolvedValueOnce(undefined).mockResolvedValue(saved);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "POST", url: "/stations", payload });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(201);
    expect(response.json().data).toMatchObject({ id: 1, siteId: "A1", status: "awaitingCells", operatorId: 1, locationId: null, isConfirmed: true });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "stations")?.values).toMatchObject({
      station_id: "A1",
      operator_id: 1,
      location_id: null,
      status: "pending",
      is_confirmed: true,
      notes: null,
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({ entity: "stations", op: "create", record_id: "1", station_id: 1, new_values: saved }),
    ]);
  });

  it("rejects an operator that does not exist before opening a transaction", async () => {
    dbMock.enqueueFor("select", "operators", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/stations", payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("Operator 1 does not exist");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("creates an active station and resolves a new cell's sector key to the inserted sector", async () => {
    const saved = stationRow();
    const created = storedCell({ ...cellInputs.gsm, sectorId: 5 });
    dbMock.enqueueFor("select", "operators", [{ id: 1 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }], cellBands);
    dbMock.enqueueFor("select", "country_bands", [{ bandId: 1 }]);
    dbMock.query.stations.findFirst.mockResolvedValueOnce(undefined).mockResolvedValue(saved);
    dbMock.enqueueFor("select", getTableName(gsmCells), []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.enqueueFor("insert", "audit_logs", [], [], []);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("select", "station_sectors", [], [{ id: 5, azimuth: 0 }]);
    dbMock.enqueueFor("insert", "station_sectors", [{ id: 5 }]);
    dbMock.enqueueFor("insert", "cells", [created.cell]);
    dbMock.enqueueFor("insert", getTableName(gsmCells), [created.radio]);
    dbMock.enqueueFor("select", "stations", [{ id: 1, locationId: null, operatorId: 1, countryCode: "PL" }], []);
    dbMock.query.cells.findMany.mockResolvedValue([{ ...created.cell, gsm: created.radio, umts: null, lte: null, nr: null }]);
    dbMock.enqueueFor("select", "cells", [{ bandId: 1, rat: "GSM", bandRat: "GSM", countryCode: "PL", plannedBandId: 1 }]);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({
      method: "POST",
      url: "/stations",
      payload: {
        ...payload,
        sectors: [{ key: "north", azimuth: 0 }],
        cells: [{ rat: "gsm", bandId: 1, lac: 1, cid: 2, sectorKey: "north" }],
      },
    });

    expect(response.statusCode, response.body).toBe(201);
    expect(response.json().data).toMatchObject({ id: 1, status: "active", isConfirmed: true });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "cells")?.values).toMatchObject({
      station_id: 1,
      sector_id: 5,
      is_confirmed: false,
    });
    expect(authBoundary.auth.api.userHasPermission.mock.calls[0]?.[0]).toMatchObject({
      body: {
        permissions: { stations: ["create"], cells: ["create"] },
      },
    });
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toContainEqual(
      expect.objectContaining({
        entity: "cells",
        op: "create",
        record_id: "11",
        station_id: 1,
        new_values: expect.objectContaining({ sector_id: 5, details: expect.objectContaining({ lac: 1, cid: 2, e_gsm: false }) }),
      }),
    );
  });

  it("creates a station without a number under a placeholder and names it after its eNB", async () => {
    const saved = stationRow({ station_id: "~1" });
    const created = storedCell(cellInputs.lte);
    const named = { stationId: 1, enbid: 100, gnbid: null, longCid: null, gsmCellKey: null };
    dbMock.enqueueFor("select", "operators", [{ id: 1 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 3 }], cellBands);
    dbMock.enqueueFor("select", "country_bands", [{ bandId: 3 }]);
    dbMock.query.stations.findFirst.mockResolvedValue(saved);
    dbMock.enqueueFor("select", getTableName(lteCells), []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("execute", undefined, [{ id: 1 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("insert", "cells", [created.cell]);
    dbMock.enqueueFor("insert", getTableName(lteCells), [created.radio]);
    dbMock.query.cells.findMany.mockResolvedValue([{ ...created.cell, gsm: null, umts: null, lte: created.radio, nr: null }]);
    dbMock.enqueueFor("select", "cells", [named], [{ bandId: 3, rat: "LTE", bandRat: "LTE", countryCode: "PL", plannedBandId: 3 }], [named]);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "POST", url: "/stations", payload: { station: { operatorId: 1 }, cells: [cellInputs.lte] } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(201);
    expect(response.json().data).toMatchObject({ id: 1, siteId: null, nodeName: "4G 100" });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "stations")?.values).toMatchObject({ id: 1, station_id: "~1" });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("creates a station without a number from a UMTS cell and names it after that cell", async () => {
    const saved = stationRow({ station_id: "~1" });
    const created = storedCell(cellInputs.umts);
    const named = { stationId: 1, enbid: null, gnbid: null, longCid: 65_538, gsmCellKey: null };
    dbMock.enqueueFor("select", "operators", [{ id: 1 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 2 }], cellBands);
    dbMock.enqueueFor("select", "country_bands", [{ bandId: 2 }]);
    dbMock.query.stations.findFirst.mockResolvedValue(saved);
    dbMock.enqueueFor("select", getTableName(umtsCells), []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("execute", undefined, [{ id: 1 }]);
    dbMock.enqueueFor("insert", "stations", [saved]);
    dbMock.enqueueFor("insert", "audit_logs", [], []);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("insert", "cells", [created.cell]);
    dbMock.enqueueFor("insert", getTableName(umtsCells), [created.radio]);
    dbMock.query.cells.findMany.mockResolvedValue([{ ...created.cell, gsm: null, umts: created.radio, lte: null, nr: null }]);
    dbMock.enqueueFor("select", "cells", [named], [{ bandId: 2, rat: "UMTS", bandRat: "UMTS", countryCode: "PL", plannedBandId: 2 }], [named]);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_watches", []);
    dbMock.enqueueFor("select", "user_lists", []);
    dbMock.enqueueFor("select", "stations", []);
    visibleStation(saved);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "POST", url: "/stations", payload: { station: { operatorId: 1 }, cells: [cellInputs.umts] } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(201);
    expect(response.json().data).toMatchObject({ id: 1, siteId: null, nodeName: "3G 1:2" });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([
    ["no number and no cell", { station: { operatorId: 1 } }, SITE_ID_NEEDED],
    ["no number and a UMTS cell without an RNC", { station: { operatorId: 1 }, cells: [{ ...cellInputs.umts, rnc: null }] }, SITE_ID_NEEDED],
    ["no number and an LTE cell without an eNB", { station: { operatorId: 1 }, cells: [{ ...cellInputs.lte, enbid: null }] }, SITE_ID_NEEDED],
    ["a number that starts with ~", { station: { siteId: "~1234", operatorId: 1 } }, "A station number cannot start with ~"],
  ])("refuses %s at station/siteId", async (_name, invalid, validationMessage) => {
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/stations", payload: invalid });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      errors: [{ code: "VALIDATION_ERROR", message: "Validation error", details: [{ field: "station/siteId", validationMessage }] }],
    });
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a duplicate site id within the same operator before any writes", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
    dbMock.query.stations.findFirst.mockResolvedValue(stationRow());
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/stations", payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toContain("already exists");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("refuses an address that a location in Poland does not take, at its field and before any writes", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 1 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "regions", [{ id: 1 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    const app = await createRouteHarness(route, { session: userSession() });
    const location = { latitude: 52, longitude: 21, regionId: 1, address: "teren własny" };
    const response = await app.inject({ method: "POST", url: "/stations", payload: { ...payload, location } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      errors: [
        {
          code: "VALIDATION_ERROR",
          message: "Validation error.",
          details: [{ field: "location/address", validationMessage: "Address must not contain variants of własny" }],
        },
      ],
    });
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("refuses a band outside the plan of the country the coordinates fall in, whatever region the request names", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 1 }], [{ countryCode: "DE" }]);
    dbMock.enqueueFor("select", "regions", [{ id: 2 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }], cellBands);
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "country_bands", []);
    dbMock.query.stations.findFirst.mockResolvedValue(undefined);
    dbMock.query.locations.findFirst.mockResolvedValue(undefined);
    const app = await createRouteHarness(route, { session: userSession() });
    const location = { latitude: 52, longitude: 21, regionId: 2 };
    const response = await app.inject({ method: "POST", url: "/stations", payload: { ...payload, location, cells: [cellInputs.gsm] } });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().errors[0].message).toBe("Band 1 is not in the band plan of PL");
    expect(whereQuery("regions", "select", 1).params).toEqual([1]);
    expect(whereQuery("country_bands", "select").params).toEqual(["PL", 1]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("rejects the edit when the caller lacks station creation permission", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/stations", payload });

    expect(response.statusCode).toBe(403);
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects a guest before resolving operator references", async () => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/stations", payload })).statusCode).toBe(403);
    expect(dbMock.calls).toEqual([]);
  });

  it.each([
    ["missing station", {}],
    ["empty site id", { station: { ...payload.station, siteId: "  " } }],
    ["site id longer than sixteen characters", { station: { ...payload.station, siteId: "a".repeat(17) } }],
    ["missing operator", { station: { siteId: "A1" } }],
    ["zero operator id", { station: { ...payload.station, operatorId: 0 } }],
    ["null location", { ...payload, location: null }],
    ["partial coordinates", { ...payload, location: { latitude: 52 } }],
    ["latitude outside the globe", { ...payload, location: { latitude: 91, longitude: 21 } }],
    ["unknown top-level field", { ...payload, extra: true }],
    ["backhaul without a medium", { station: { ...payload.station, backhaul: { speedMbps: 1 } } }],
    [
      "duplicate identifier kinds",
      {
        station: {
          ...payload.station,
          identifiers: [
            { kind: "networksId", value: "1" },
            { kind: "networksId", value: "2" },
          ],
        },
      },
    ],
    ["invalid numeric identifier", { station: { ...payload.station, identifiers: [{ kind: "networksId", value: "abc" }] } }],
    ["reserved sector key", { ...payload, sectors: [{ key: "sector-1", azimuth: 0 }] }],
    ["sector azimuth outside the circle", { ...payload, sectors: [{ key: "north", azimuth: 360 }] }],
    ["too many sectors", { ...payload, sectors: Array.from({ length: 31 }, (_, index) => ({ key: `s${index}`, azimuth: index })) }],
    ["too many cells", { ...payload, cells: Array.from({ length: 201 }, () => ({ rat: "gsm", bandId: 1, lac: 1, cid: 2 })) }],
  ])("rejects %s before authorization or database writes", async (_name, invalid) => {
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "POST", url: "/stations", payload: invalid })).statusCode).toBe(400);
    expect(authBoundary.auth.api.userHasPermission).not.toHaveBeenCalled();
    expect(dbMock.calls).toEqual([]);
  });
});
