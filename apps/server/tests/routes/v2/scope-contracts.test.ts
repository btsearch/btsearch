import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import deleteCell from "../../../src/routes/v2/(delete)/cells/[id].js";
import deleteLocationPhoto from "../../../src/routes/v2/(delete)/locations/[id]/photos/[photoId].js";
import deleteStation from "../../../src/routes/v2/(delete)/stations/[id].js";
import updateCell from "../../../src/routes/v2/(patch)/cells/[id].js";
import updateLocationPhoto from "../../../src/routes/v2/(patch)/locations/[id]/photos/[photoId].js";
import updateStation from "../../../src/routes/v2/(patch)/stations/[id].js";
import applyCells from "../../../src/routes/v2/(post)/cells/apply.js";
import uploadLocationPhotos from "../../../src/routes/v2/(post)/locations/[id]/photos.js";
import createCells from "../../../src/routes/v2/(post)/stations/[id]/cells.js";
import createStation from "../../../src/routes/v2/(post)/stations/index.js";
import replaceStationPhotos from "../../../src/routes/v2/(put)/stations/[id]/photos.js";
import { dbMock } from "../../helpers/boundaries.js";
import { photoId } from "../../helpers/photoFixtures.js";

function request(params: Record<string, unknown>, body: unknown = {}) {
  return { params, body } as unknown as FastifyRequest;
}

describe("v2 mutation scope targets", () => {
  it.each([undefined, 2])("requires cell access and includes destination station %s when moving a cell", async (stationId) => {
    expect(await updateCell.config?.scope?.(request({ id: 11 }, { stationId }))).toEqual({
      cellIds: [11],
      stationIds: stationId === undefined ? [] : [2],
    });
    expect(dbMock.calls).toEqual([]);
  });

  it("requires access to the deleted cell's own station through its cell reference", async () => {
    expect(await deleteCell.config?.scope?.(request({ id: 11 }))).toEqual({ cellIds: [11] });
  });

  it("requires access to every station in a batch cell application", async () => {
    expect(
      await applyCells.config?.scope?.(
        request({}, [
          { stationId: 1, cells: [{ action: "update", id: 11, notes: "new" }] },
          { stationId: 2, cells: [{ action: "update", id: 12, notes: "new" }] },
        ]),
      ),
    ).toEqual({ stationIds: [1, 2] });
  });

  it("requires country access to the operator when creating a station without coordinates", async () => {
    expect(await createStation.config?.scope?.(request({}, { station: { siteId: "A1", operatorId: 2 } }))).toEqual({
      placements: [{ locationId: null, operatorId: 2 }],
    });
  });

  it("keeps ordinary station edits scoped to the current station", async () => {
    expect(await updateStation.config?.scope?.(request({ id: 1 }, { station: { notes: "new" } }))).toEqual({
      stationIds: [1],
      locationIds: [],
      detachedStationIds: [],
      operatorChanges: [],
    });
  });

  it("requires country access for detaching a station and accounts for its replacement operator", async () => {
    expect(await updateStation.config?.scope?.(request({ id: 1 }, { station: { operatorId: 2 }, location: null }))).toEqual({
      stationIds: [1],
      locationIds: [],
      detachedStationIds: [1],
      operatorChanges: [{ stationId: 1, operatorId: 2, location: "removed" }],
    });
  });

  it("checks a replacement operator while keeping the station's location", async () => {
    expect(await updateStation.config?.scope?.(request({ id: 1 }, { station: { operatorId: 2 } }))).toEqual({
      stationIds: [1],
      locationIds: [],
      detachedStationIds: [],
      operatorChanges: [{ stationId: 1, operatorId: 2, location: "kept" }],
    });
  });

  it("includes every destination when individual cells move during a station edit", async () => {
    expect(
      await updateStation.config?.scope?.(
        request(
          { id: 1 },
          {
            cells: [
              { action: "update", id: 11, stationId: 2 },
              { action: "delete", id: 12 },
            ],
          },
        ),
      ),
    ).toMatchObject({ stationIds: [1, 2] });
  });

  it.each([deleteStation, createCells, replaceStationPhotos])("scopes station operation $method $url to its station", async (route) => {
    expect(await route.config?.scope?.(request({ id: 1 }))).toEqual({ stationIds: [1] });
  });

  it("scopes photo metadata changes to the owning location", async () => {
    expect(await updateLocationPhoto.config?.scope?.(request({ id: 2, photoId }, { note: "new" }))).toEqual({ locationIds: [2] });
  });

  it("scopes photo uploads to the owning location", async () => {
    expect(await uploadLocationPhotos.config?.scope?.(request({ id: 2 }))).toEqual({ locationIds: [2] });
  });

  it("requires access to every location photo sharing the deleted attachment", async () => {
    dbMock.enqueueFor("select", "location_photos", [{ id: 5 }, { id: 6 }]);

    expect(await deleteLocationPhoto.config?.scope?.(request({ id: 2, photoId }))).toEqual({ locationIds: [2], locationPhotoIds: [5, 6] });
    expect(dbMock.pendingResults()).toBe(0);
  });
});
