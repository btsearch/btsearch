import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../../src/routes/v2/(patch)/locations/[id]/photos/[photoId].js";
import { dbMock } from "../../../../../../helpers/boundaries.js";
import { locationPhotoRow, photoId, photoRow } from "../../../../../../helpers/photoFixtures.js";
import { createRouteHarness } from "../../../../../../helpers/routeHarness.js";

const url = `/locations/2/photos/${photoId}`;

describe("PATCH /locations/:id/photos/:photoId", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T10:00:00.000Z"));
  });

  it.each([
    ["sets a note", { note: "Lorem ipsum" }, { note: "Lorem ipsum", taken_at: undefined }, { note: "Lorem ipsum" }],
    ["clears a note", { note: null }, { note: null, taken_at: undefined }, { note: null }],
    ["clears an empty note", { note: "" }, { note: null, taken_at: undefined }, { note: null }],
    [
      "sets a timestamp",
      { takenAt: "2026-10-05T10:00:00Z" },
      { note: undefined, taken_at: new Date("2026-10-05T10:00:00Z") },
      { takenAt: new Date("2026-10-05T10:00:00Z") },
    ],
    [
      "accepts the current timestamp",
      { takenAt: "2026-10-06T10:00:00Z" },
      { note: undefined, taken_at: new Date("2026-10-06T10:00:00Z") },
      { takenAt: new Date("2026-10-06T10:00:00Z") },
    ],
    ["clears a timestamp", { takenAt: null }, { note: undefined, taken_at: null }, { takenAt: null }],
  ])("%s while leaving omitted fields unchanged", async (_name, payload, expectedValues, overrides) => {
    const previous = locationPhotoRow();
    const current = photoRow(overrides);
    dbMock.enqueueFor("select", "location_photos", [{ photo: previous }], [previous], [current]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("update", "location_photos", [{ ...previous, ...expectedValues }]);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PATCH", url, payload });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(200);
    expect(response.json().data).toMatchObject({ id: photoId, locationId: 2, note: current.note, takenAt: current.takenAt?.toISOString() ?? null });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "location_photos")?.values).toEqual(expectedValues);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({ entity: "location_photos", op: "update", record_id: "5", old_values: previous, metadata: { location_id: 2 } }),
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("rejects a future takenAt before looking up a photo", async () => {
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PATCH", url, payload: { takenAt: "2026-10-06T10:00:00.001Z" } });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("takenAt cannot be in the future");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns 404 when the photo does not belong to this location", async () => {
    dbMock.enqueueFor("select", "location_photos", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PATCH", url, payload: { note: "new" } })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the photo disappears before the row lock", async () => {
    dbMock.enqueueFor("select", "location_photos", [{ photo: locationPhotoRow() }], []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PATCH", url, payload: { note: "new" } })).statusCode).toBe(404);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it.each([[], new Error("database unavailable")])("preserves update failure when no photo can be saved (%j)", async (result) => {
    dbMock.enqueueFor("select", "location_photos", [{ photo: locationPhotoRow() }], [locationPhotoRow()]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("update", "location_photos", result);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PATCH", url, payload: { note: "new" } });

    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_UPDATE");
    expect(dbMock.calls.some((call) => call.table === "audit_logs")).toBe(false);
  });

  it.each([
    ["empty edit", {}],
    ["unknown field", { extra: true }],
    ["invalid timestamp", { takenAt: "yesterday" }],
    ["non-string note", { note: 123 }],
    ["overlong note", { note: "a".repeat(101) }],
  ])("rejects %s before looking up a photo", async (_name, payload) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PATCH", url, payload })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["not-a-uuid", "0"])("rejects invalid photo id %s", async (id) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PATCH", url: `/locations/2/photos/${id}`, payload: { note: "new" } })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
