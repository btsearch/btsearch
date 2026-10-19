import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/stations/[id].js";
import { authBoundary, dbMock, userSession } from "../../../../helpers/boundaries.js";
import { cellBands, cellInputs, prepareCellChange, writeCreatedCells } from "../../../../helpers/cellWriteFixtures.js";
import { whereQuery } from "../../../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../../../helpers/stationFixtures.js";
import { detachPlacedStation, movePlacedStation, placedStation } from "../../../../helpers/stationLocationFixtures.js";

function editableStation() {
  const current = stationRow({ notes: "old", location: null, sectors: [] });
  visibleStation(current);
  dbMock.query.stations.findFirst.mockResolvedValue(current);
  dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
  dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
  return current;
}

function writeStation(updated: ReturnType<typeof stationRow>) {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "station_photo_selections", [], []);
  dbMock.enqueueFor("update", "stations", [updated], []);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  visibleStation(updated);
  dbMock.enqueueFor("select", "extra_identificators", []);
}

describe("PATCH /stations/:id", () => {
  it("detaches a station with an explicit null location while keeping a shared location", async () => {
    const { current } = placedStation();
    detachPlacedStation(current);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { location: null } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.locationId).toBeNull();
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date) },
      { updatedAt: expect.any(Date), location_id: null },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "delete" && ["locations", "location_photos"].includes(call.table ?? ""))).toBe(false);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "stations", op: "update", old_values: { location_id: 2 }, new_values: { location_id: null } },
    ]);
  });

  it("keeps an existing location when the location field is omitted", async () => {
    const { current } = placedStation();
    const saved = { ...current, notes: "updated" };
    writeStation(saved);
    dbMock.enqueueFor("select", "stations", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes: "updated" } } });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(response.json().data).toMatchObject({ locationId: 2, notes: "updated" });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date), notes: "updated" },
      { updatedAt: expect.any(Date) },
    ]);
    expect(dbMock.calls.some((call) => ["locations", "location_photos"].includes(call.table ?? "") && call.operation !== "select")).toBe(false);
  });

  it.each([undefined, "station"] as const)("moves only the station when location.move is %s", async (move) => {
    movePlacedStation("station");
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({
      method: "PATCH",
      url: "/stations/1",
      payload: { location: { latitude: 52.1, longitude: 21.1, regionId: 1, ...(move === undefined ? {} : { move }) } },
    });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(response.json().data.locationId).toBe(3);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "locations")?.values).toMatchObject({
      latitude: 52.1,
      longitude: 21.1,
    });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "stations")?.values).toMatchObject({ location_id: 3 });
    expect(dbMock.calls.some((call) => call.table === "locations" && ["update", "delete"].includes(call.operation))).toBe(false);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toMatchObject([
      { entity: "locations", op: "create", record_id: "3" },
      { entity: "stations", op: "update", old_values: { location_id: 2 }, new_values: { location_id: 3 } },
    ]);
  });

  it("moves the whole shared location without changing resident station location IDs", async () => {
    movePlacedStation("location");
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({
      method: "PATCH",
      url: "/stations/1",
      payload: { location: { latitude: 52.1, longitude: 21.1, regionId: 1, move: "location" } },
    });

    expect(response.statusCode, errors.map(String).join("\n") || response.body).toBe(200);
    expect(response.json().data.locationId).toBe(2);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "locations")?.values).toMatchObject({
      latitude: 52.1,
      longitude: 21.1,
    });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date) },
    ]);
    expect(dbMock.calls.some((call) => call.table === "locations" && ["insert", "delete"].includes(call.operation))).toBe(false);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toMatchObject([
      { entity: "locations", op: "update", old_values: { latitude: 52, longitude: 21 }, new_values: { latitude: 52.1, longitude: 21.1 } },
    ]);
  });

  it("applies an explicit inactive status after creating a cell and checks both station and cell permissions", async () => {
    const current = prepareCellChange([cellInputs.gsm], { status: "pending" });
    const published = { ...current, status: "published" as const };
    const inactive = { ...current, status: "inactive" as const };
    dbMock.query.stations.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(published)
      .mockResolvedValue(inactive);
    writeCreatedCells([cellInputs.gsm], { status: "pending" });
    dbMock.enqueueFor("update", "stations", [inactive]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    visibleStation(inactive);
    dbMock.enqueueFor("select", "extra_identificators", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({
      method: "PATCH",
      url: "/stations/1",
      payload: { station: { status: "inactive" }, cells: [{ action: "create", ...cellInputs.gsm }] },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.status).toBe("inactive");
    expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ permissions: { stations: ["update"], cells: ["create"] } }) }),
    );
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { status: "published", statusChangedAt: expect.any(Date), updatedAt: expect.any(Date) },
      { status: "inactive", statusChangedAt: expect.any(Date), updatedAt: expect.any(Date) },
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs").flatMap((call) => call.values)).toMatchObject([
      { entity: "stations", op: "update", old_values: { status: "pending" }, new_values: { status: "published" } },
      { entity: "cells", op: "create", record_id: "11" },
      { entity: "stations", op: "update", old_values: { status: "published" }, new_values: { status: "inactive" } },
    ]);
  });

  it("refuses to reactivate a station whose cell identity an active station took meanwhile", async () => {
    const current = stationRow({ status: "inactive", location: null, sectors: [] });
    visibleStation(current);
    dbMock.query.stations.findFirst.mockResolvedValue(current);
    dbMock.query.extraIdentificators.findFirst.mockResolvedValue(undefined);
    dbMock.query.stationBackhauls.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], []);
    dbMock.enqueueFor("update", "stations", [], [{ ...current, status: "published" }]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    const storedLte = {
      id: 11,
      rat: "LTE",
      gsm: null,
      umts: null,
      lte: { enbid: 100, clid: 1 },
      nr: null,
      plmns: [],
      station: { operator_id: 1, status: "published", operator: { id: 1, plmns: [{ code: "26001" }] } },
    };
    dbMock.query.cells.findMany.mockResolvedValue([storedLte]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "lte_cells", [{ enbid: 100, clid: 1 }]);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { status: "active" } } });

    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().errors[0]).toMatchObject({
      code: "DUPLICATE_ENTRY",
      message: "An LTE cell with eNBID 100 and CLID 1 already exists on one of the cell's networks",
    });
    expect(dbMock.query.cells.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ id: { in: [] } }, { station_id: 1 }] } }));
  });

  it.each([
    ["notes", " new notes ", " new notes "],
    ["null notes", null, null],
    ["blank notes", "   ", null],
  ])("updates %s without changing the station identity or location", async (_name, notes, expected) => {
    editableStation();
    const updated = stationRow({ notes: expected });
    writeStation(updated);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes } } });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, siteId: "A1", notes: expected, operatorId: 1, locationId: null });
    expect(dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values)).toEqual([
      { updatedAt: expect.any(Date), notes: expected },
      { updatedAt: expect.any(Date) },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "locations")).toBe(false);
  });

  it("refuses an address that a location in Poland does not take, at its field and before any writes", async () => {
    placedStation();
    dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "PL" }]);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { location: { address: "teren własny" } } });

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

  it("refuses a band outside the plan of the country the station stays in, whatever region the request names", async () => {
    placedStation();
    dbMock.enqueueFor("select", "regions", [{ id: 2 }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }], cellBands);
    dbMock.enqueueFor(
      "select",
      "stations",
      [{ stationId: 1, region_id: 1, latitude: 52, longitude: 21 }],
      [{ locationCountry: "PL", operatorCountry: "PL" }],
    );
    dbMock.enqueueFor("execute", undefined, [{ regionId: 1 }]);
    dbMock.enqueueFor("select", "country_bands", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const payload = { location: { regionId: 2 }, cells: [{ action: "create", ...cellInputs.gsm }] };
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload });

    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().errors[0].message).toBe("Band 1 is not in the band plan of PL");
    expect(whereQuery("regions", "select", 1).params).toEqual([1]);
    expect(whereQuery("country_bands", "select").params).toEqual(["PL", 1]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns 404 for a missing station before translating or saving edits", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes: "new" } } })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each([{ station: {} }, { cells: [], sectors: [] }])("rejects empty semantic edits %j without a transaction", async (payload) => {
    visibleStation();
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("No changes detected");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects missing update permission before translating the request", async () => {
    visibleStation();
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes: "new" } } })).statusCode).toBe(403);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("does not report a successful update if the database returns no updated station", async () => {
    editableStation();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    dbMock.enqueueFor("update", "stations", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PATCH", url: "/stations/1", payload: { station: { notes: "new" } } });

    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it.each([
    ["empty body", {}],
    ["unknown field", { extra: true }],
    ["partial coordinates", { location: { latitude: 52 } }],
    ["move without coordinates", { location: { move: "location" } }],
    ["invalid move mode", { location: { latitude: 52, longitude: 21, move: "country" } }],
    ["unknown station status", { station: { status: "deleted" } }],
    ["non-boolean confirmation", { station: { isConfirmed: "true" } }],
    [
      "duplicate cell edits",
      {
        cells: [
          { action: "delete", id: 1 },
          { action: "update", id: 1, notes: "new" },
        ],
      },
    ],
    ["invalid sector action", { sectors: [{ action: "replace", id: 1, azimuth: 0 }] }],
    ["sector azimuth below zero", { sectors: [{ action: "update", id: 1, azimuth: -1 }] }],
  ])("rejects %s before loading the station", async (_name, payload) => {
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "PATCH", url: "/stations/1", payload })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
