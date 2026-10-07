import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../../src/routes/v2/(delete)/locations/[id]/photos/[photoId].js";
import { dbMock } from "../../../../../../helpers/boundaries.js";
import { locationPhotoRow, photoId } from "../../../../../../helpers/photoFixtures.js";
import { createRouteHarness } from "../../../../../../helpers/routeHarness.js";

const files = vi.hoisted(() => ({ unlink: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files, ...files }));
const url = `/locations/2/photos/${photoId}`;

describe("DELETE /locations/:id/photos/:photoId", () => {
  beforeEach(() => files.unlink.mockReset().mockResolvedValue(undefined));

  it.each([false, true])("deletes an attachment and audits all affected photos, including shared=%s", async (shared) => {
    const previous = locationPhotoRow();
    const affected = [previous, ...(shared ? [locationPhotoRow({ id: 6, location_id: 3 })] : [])];
    dbMock.enqueueFor("select", "location_photos", [{ photo: previous }]);
    dbMock.query.locationPhotos.findFirst.mockResolvedValue(previous);
    dbMock.query.locationPhotos.findMany.mockResolvedValue(affected);
    dbMock.query.attachments.findFirst.mockResolvedValue({ id: 3, uuid: photoId });
    dbMock.enqueueFor("select", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("delete", "location_photos", []);
    dbMock.enqueueFor("delete", "attachments", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "DELETE", url });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(204);
    expect(dbMock.calls.filter((call) => call.operation === "delete").map((call) => call.table)).toEqual(["location_photos", "attachments"]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual(
      affected.map((row) =>
        expect.objectContaining({
          entity: "location_photos",
          op: "delete",
          record_id: String(row.id),
          old_values: row,
          metadata: { location_id: row.location_id },
        }),
      ),
    );
    expect(
      files.unlink.mock.calls
        .map(([path]) => String(path).replaceAll("\\", "/").split("/").at(-1))
        .sort((left, right) => (left ?? "").localeCompare(right ?? "")),
    ).toEqual([`${photoId}.full.avif`, `${photoId}.thumb.webp`, `${photoId}.webp`]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("deletes an orphaned location photo without attempting file removal when its attachment is missing", async () => {
    const previous = locationPhotoRow();
    dbMock.enqueueFor("select", "location_photos", [{ photo: previous }]);
    dbMock.query.locationPhotos.findFirst.mockResolvedValue(previous);
    dbMock.query.locationPhotos.findMany.mockResolvedValue([previous]);
    dbMock.query.attachments.findFirst.mockResolvedValue(undefined);
    dbMock.enqueueFor("select", "station_photo_selections", []);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("delete", "location_photos", []);
    dbMock.enqueueFor("insert", "audit_logs", []);
    dbMock.enqueueFor("select", "audit_logs", []);
    dbMock.enqueueFor("update", "audit_operations", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(204);
    expect(files.unlink).not.toHaveBeenCalled();
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "attachments")).toBe(false);
  });

  it("returns 404 when the photo is not attached to the named location", async () => {
    dbMock.enqueueFor("select", "location_photos", []);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(404);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("preserves 404 when the photo disappears before the transaction loads it", async () => {
    dbMock.enqueueFor("select", "location_photos", [{ photo: locationPhotoRow() }]);
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.query.locationPhotos.findFirst.mockResolvedValue(undefined);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url })).statusCode).toBe(404);
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("keeps files when the delete transaction fails", async () => {
    dbMock.enqueueFor("select", "location_photos", [{ photo: locationPhotoRow() }]);
    dbMock.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "DELETE", url });

    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("FAILED_TO_DELETE");
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "0"])("rejects photo id %s before database or filesystem access", async (id) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "DELETE", url: `/locations/2/photos/${id}` })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
    expect(files.unlink).not.toHaveBeenCalled();
  });
});
