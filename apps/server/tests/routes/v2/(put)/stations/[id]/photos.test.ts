import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(put)/stations/[id]/photos.js";
import { auditOperationRow } from "../../../../../helpers/auditFixtures.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { photoId, photoRow } from "../../../../../helpers/photoFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../../../../helpers/stationFixtures.js";

const secondId = "b02754db-6c4d-43f0-8ef4-b0ce062b0cbb";
const sharedKey = "4d7c2f0e-5d0b-4c53-9d1e-6a0c8f6a2b11";
const signedInId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const keyHeaders = { "x-audit-operation-id": sharedKey };
const HOUR_MS = 60 * 60 * 1000;

function uploadOperation(overrides: Record<string, unknown> = {}) {
  return {
    ...auditOperationRow,
    kind: "location.photos",
    client_key: sharedKey,
    actor_id: signedInId,
    performed_by: signedInId,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function scriptKeyedSelection(storedOperations: unknown[]) {
  visibleStation(stationRow({ location_id: 2 }));
  dbMock.enqueueFor("select", "location_photos", [{ id: 5, fileId: photoId }]);
  dbMock.enqueueFor("execute", undefined, []);
  dbMock.enqueueFor("select", "audit_operations", storedOperations);
  dbMock.enqueueFor(
    "select",
    "station_photo_selections",
    [{ station_id: 1, location_photo_id: 8, is_main: true }],
    [{ station_id: 1, location_photo_id: 5, is_main: false }],
    [photoRow()],
    [{ locationPhotoId: 5, stationId: 1, isMain: false }],
  );
  dbMock.enqueueFor("delete", "station_photo_selections", []);
  dbMock.enqueueFor("insert", "station_photo_selections", []);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("select", "users", [{ role: "user" }]);
  dbMock.enqueueFor("select", "role_grants", []);
}

function operationWrites(operation: "insert" | "update") {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === "audit_operations").map((call) => call.values);
}

describe("PUT /stations/:id/photos", () => {
  it.each([
    { name: "a guest", signedIn: false, status: 401 },
    { name: "a user without station update permission", signedIn: true, status: 403 },
  ])("rejects $name through the real authentication middleware before reading photos", async ({ signedIn, status }) => {
    authBoundary.getCurrentUser.mockResolvedValue(signedIn ? userSession() : null);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { runAuth: true });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [] } });

    expect(response.statusCode, response.body).toBe(status);
    expect(dbMock.calls).toEqual([]);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    if (signedIn)
      expect(authBoundary.auth.api.userHasPermission.mock.calls[0]?.[0]).toMatchObject({ body: { permissions: { stations: ["update"] } } });
  });

  it.each([photoId, null, undefined])("replaces selections and sets only mainPhotoId=%s as main", async (mainPhotoId) => {
    visibleStation(stationRow({ location_id: 2 }));
    dbMock.enqueueFor("select", "location_photos", [
      { id: 5, fileId: photoId },
      { id: 6, fileId: secondId },
    ]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    const next = [
      { station_id: 1, location_photo_id: 5, is_main: mainPhotoId === photoId },
      { station_id: 1, location_photo_id: 6, is_main: false },
    ];
    dbMock.enqueueFor(
      "select",
      "station_photo_selections",
      [{ station_id: 1, location_photo_id: 8, is_main: true }],
      next,
      [photoRow()],
      [{ locationPhotoId: 5, stationId: 1, isMain: mainPhotoId === photoId }],
    );
    dbMock.enqueueFor("delete", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [photoId, secondId], mainPhotoId } });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_photo_selections")?.values).toEqual(next);
    expect(response.json().data[0]).toMatchObject({ id: photoId, selections: [{ stationId: 1, isMain: mainPhotoId === photoId }] });
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["station_photo_selections"]);
  });

  it.each([null, 2])("clears selections at location %s and preserves the location's photo files", async (locationId) => {
    visibleStation(stationRow({ location_id: locationId }));
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("select", "station_photo_selections", [], [], []);
    dbMock.enqueueFor("delete", "station_photo_selections", []);
    dbMock.enqueueFor("delete", "audit_operations", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [] } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "location_photos")).toBe(false);
  });

  it("maps photos by their IDs when lookup order differs and makes the second selected photo main", async () => {
    visibleStation(stationRow({ location_id: 2 }));
    dbMock.enqueueFor("select", "location_photos", [
      { id: 6, fileId: secondId },
      { id: 5, fileId: photoId },
    ]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    const next = [
      { station_id: 1, location_photo_id: 5, is_main: false },
      { station_id: 1, location_photo_id: 6, is_main: true },
    ];
    dbMock.enqueueFor(
      "select",
      "station_photo_selections",
      [{ station_id: 1, location_photo_id: 8, is_main: true }],
      next,
      [photoRow({ locationPhotoId: 6, fileId: secondId }), photoRow()],
      [
        { locationPhotoId: 6, stationId: 1, isMain: true },
        { locationPhotoId: 5, stationId: 1, isMain: false },
      ],
    );
    dbMock.enqueueFor("delete", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({
      method: "PUT",
      url: "/stations/1/photos",
      payload: { photoIds: [photoId, secondId], mainPhotoId: secondId },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "station_photo_selections")?.values).toEqual(next);
    expect(response.json().data).toEqual([
      expect.objectContaining({ id: secondId, selections: [{ stationId: 1, isMain: true }] }),
      expect.objectContaining({ id: photoId, selections: [{ stationId: 1, isMain: false }] }),
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({
        entity: "station_photo_selections",
        op: "update",
        record_id: null,
        station_id: 1,
        old_values: [{ location_photo_id: 8, is_main: true }],
        new_values: [
          { location_photo_id: 5, is_main: false },
          { location_photo_id: 6, is_main: true },
        ],
      }),
    ]);
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["station_photo_selections"]);
  });

  it.each([null, 2])("rejects photos outside the station's location (%s) before deleting its selections", async (locationId) => {
    visibleStation(stationRow({ location_id: locationId }));
    if (locationId !== null) dbMock.enqueueFor("select", "location_photos", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [photoId] } });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("Some photos do not belong to this station's location");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown station", async () => {
    dbMock.enqueueFor("select", "stations", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [] } })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("returns FAILED_TO_UPDATE when the selection transaction fails", async () => {
    visibleStation();
    dbMock.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [] } });

    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_UPDATE");
  });

  it("preserves the audit creation error and does not delete selections when no audit operation is created", async () => {
    visibleStation();
    dbMock.enqueueFor("insert", "audit_operations", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", payload: { photoIds: [] } });

    expect(response.statusCode, response.body).toBe(500);
    expect(response.json().errors[0]).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create audit operation" });
    expect(dbMock.delete).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.table === "station_photo_selections")).toBe(false);
  });

  it("joins the operation the same person opened with the same key and takes the lead over its upload kind", async () => {
    scriptKeyedSelection([uploadOperation()]);
    dbMock.enqueueFor("update", "audit_operations", [{ id: 7 }], [], []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", headers: keyHeaders, payload: { photoIds: [photoId] } });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(200);
    expect(operationWrites("insert")).toEqual([]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({ operation_id: 7, entity: "station_photo_selections" }),
    ]);
    expect(operationWrites("update")).toEqual([
      { metadata: null },
      { kind: "station.photos", actor_id: signedInId, metadata: null },
      expect.objectContaining({ country_code: null }),
    ]);
  });

  it("stores the key on the operation when the key is new", async () => {
    scriptKeyedSelection([]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", headers: keyHeaders, payload: { photoIds: [photoId] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(operationWrites("insert")).toEqual([expect.objectContaining({ client_key: sharedKey, kind: "station.photos" })]);
  });

  it.each([
    { name: "an operation of another family", stored: { kind: "band.create" } },
    { name: "an operation older than an hour", stored: { createdAt: new Date(Date.now() - HOUR_MS - 1000) } },
    { name: "another person's operation", stored: { actor_id: otherUserId, performed_by: otherUserId } },
    { name: "an operation that has been reverted", stored: { reverted_by_operation_id: 3 } },
    { name: "a revert", stored: { reverts_operation_id: 3 } },
  ])("opens its own operation when the key belongs to $name", async ({ stored }) => {
    scriptKeyedSelection([uploadOperation(stored)]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", headers: keyHeaders, payload: { photoIds: [photoId] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(operationWrites("insert")).toEqual([expect.objectContaining({ client_key: null, kind: "station.photos" })]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({ operation_id: 9 }),
    ]);
    expect(operationWrites("update")).toEqual([expect.objectContaining({ country_code: null })]);
  });

  it.each([
    { name: "without the header", headers: {}, signedIn: true },
    { name: "with a key that is not a UUID", headers: { "x-audit-operation-id": "station-save" }, signedIn: true },
    { name: "for a caller without a session", headers: keyHeaders, signedIn: false },
  ])("never looks for an operation to join $name", async ({ headers, signedIn }) => {
    visibleStation(stationRow({ location_id: 2 }));
    dbMock.enqueueFor("select", "location_photos", [{ id: 5, fileId: photoId }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor(
      "select",
      "station_photo_selections",
      [{ station_id: 1, location_photo_id: 8, is_main: true }],
      [{ station_id: 1, location_photo_id: 5, is_main: false }],
      [photoRow()],
      [{ locationPhotoId: 5, stationId: 1, isMain: false }],
    );
    dbMock.enqueueFor("delete", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    if (signedIn) {
      dbMock.enqueueFor("select", "users", [{ role: "user" }]);
      dbMock.enqueueFor("select", "role_grants", []);
    }
    const app = await createRouteHarness(route, { session: signedIn ? userSession() : null });
    const response = await app.inject({ method: "PUT", url: "/stations/1/photos", headers, payload: { photoIds: [photoId] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.execute).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "select" && call.table === "audit_operations")).toBe(false);
    expect(operationWrites("insert")).toEqual([expect.objectContaining({ client_key: null, kind: "station.photos" })]);
  });

  it.each([
    ["missing selection", {}],
    ["duplicate photos", { photoIds: [photoId, photoId] }],
    ["main photo outside the selection", { photoIds: [photoId], mainPhotoId: secondId }],
    ["invalid photo UUID", { photoIds: ["invalid"] }],
    ["unknown field", { photoIds: [], extra: true }],
  ])("rejects %s before reading station state", async (_name, payload) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PUT", url: "/stations/1/photos", payload })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });
});
