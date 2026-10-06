import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/locations/[id]/photos.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { sharpPhotoInput } from "../../../../../helpers/imageFixtures.js";
import { multipartPayload } from "../../../../../helpers/multipart.js";
import { locationPhotoRow, photoId, photoRow } from "../../../../../helpers/photoFixtures.js";
import { readLocation } from "../../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const files = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files, ...files }));
let input: Buffer;

function location() {
  dbMock.enqueueFor("select", "locations", [{ ...readLocation, location: { ...readLocation.location, id: 2 } }]);
  dbMock.enqueueFor("select", "countries", []);
}

function upload(content: Buffer = input) {
  return multipartPayload([{ name: "photos", filename: "photo.png", content, contentType: "image/png" }]);
}

function scriptUpload() {
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("insert", "attachments", [{ id: 3, uuid: photoId }]);
  dbMock.enqueueFor("insert", "location_photos", [locationPhotoRow({ uploaded_by: userSession().user.id })]);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
  dbMock.enqueueFor("select", "location_photos", [photoRow()]);
  dbMock.enqueueFor("select", "station_photo_selections", []);
  dbMock.enqueueFor("select", "users", [{ role: "user" }]);
  dbMock.enqueueFor("select", "role_grants", []);
}

describe("POST /locations/:id/photos", () => {
  beforeAll(async () => {
    input = await sharpPhotoInput();
  });
  beforeEach(() => {
    files.mkdir.mockReset().mockResolvedValue(undefined);
    files.writeFile.mockReset().mockResolvedValue(undefined);
    files.unlink.mockReset().mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(photoId);
  });

  it("encodes a real sharp photo, saves both display and thumbnail files, and audits its location", async () => {
    location();
    scriptUpload();
    const errors: Error[] = [];
    const app = await createRouteHarness(route, { session: userSession(), onError: (error) => errors.push(error) });
    const response = await app.inject({ method: "POST", url: "/locations/2/photos", ...upload() });

    expect(response.statusCode, errors.map(String).join("\n")).toBe(201);
    expect(response.json().data).toEqual([expect.objectContaining({ id: photoId, locationId: 2, width: 640, height: 480 })]);
    expect(files.writeFile).toHaveBeenCalledTimes(2);
    const storedFiles = await Promise.all(files.writeFile.mock.calls.map(([, buffer]) => sharp(buffer as Buffer).metadata()));
    for (const storedFile of storedFiles) expect(storedFile).toMatchObject({ format: "webp" });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "attachments")?.values).toEqual([
      expect.objectContaining({
        uuid: photoId,
        name: "photo.png",
        author_id: userSession().user.id,
        mime_type: "image/webp",
        width: 640,
        height: 480,
      }),
    ]);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "location_photos")?.values).toEqual([
      { location_id: 2, attachment_id: 3, uploaded_by: userSession().user.id, note: null, taken_at: null },
    ]);
    expect(files.unlink).not.toHaveBeenCalled();
  });

  it("associates and trims multipart note and date fields with their photo", async () => {
    location();
    scriptUpload();
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({
      method: "POST",
      url: "/locations/2/photos",
      ...multipartPayload([
        { name: "notes", content: "  Lorem ipsum  " },
        { name: "takenAts", content: "2026-01-01T00:00:00Z" },
        { name: "photos", filename: "photo.png", content: input },
      ]),
    });

    expect(response.statusCode).toBe(201);
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "location_photos")?.values).toEqual([
      expect.objectContaining({ note: "Lorem ipsum", taken_at: new Date("2026-01-01T00:00:00Z") }),
    ]);
  });

  it("returns 401 for a guest without reading the location or file", async () => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/locations/2/photos", ...upload() })).statusCode).toBe(401);
    expect(dbMock.calls).toEqual([]);
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it("rejects non-multipart data before reading the location", async () => {
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/locations/2/photos", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("Photos must be sent as multipart/form-data");
    expect(dbMock.calls).toEqual([]);
  });

  it("returns 404 for a missing location before saving files", async () => {
    dbMock.enqueueFor("select", "locations", []);
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "POST", url: "/locations/2/photos", ...upload() })).statusCode).toBe(404);
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ["fields without files", [{ name: "notes", content: "A note" }]],
    ["untouched empty file input", [{ name: "photos", filename: "", content: "" }]],
    ["invalid image data", [{ name: "photos", filename: "photo.png", content: "not an image" }]],
  ])("rejects %s without attachment records", async (_name, parts) => {
    location();
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "POST", url: "/locations/2/photos", ...multipartPayload(parts) })).statusCode).toBe(400);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it.each(["too small", "too blurry"])("rejects a photo that is %s using the actual image checks", async (kind) => {
    location();
    const content = await sharp({ create: { width: kind === "too small" ? 639 : 640, height: 480, channels: 3, background: "white" } })
      .png()
      .toBuffer();
    const app = await createRouteHarness(route, { session: userSession() });

    expect((await app.inject({ method: "POST", url: "/locations/2/photos", ...upload(content) })).statusCode).toBe(400);
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["invalid timestamp", "future timestamp"])("removes encoded files when the photo has an %s", async (kind) => {
    location();
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({
      method: "POST",
      url: "/locations/2/photos",
      ...multipartPayload([
        { name: "takenAts", content: kind === "invalid timestamp" ? "yesterday" : "9998-01-01T00:00:00Z" },
        { name: "photos", filename: "photo.png", content: input },
      ]),
    });

    expect(response.statusCode).toBe(400);
    expect(files.unlink).toHaveBeenCalledTimes(3);
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["attachment count", "photo count", "transaction", "file write"])("cleans up files when saving fails at %s", async (failure) => {
    location();
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
    dbMock.enqueueFor("insert", "attachments", failure === "attachment count" ? [] : [{ id: 3, uuid: photoId }]);
    if (failure === "photo count") dbMock.enqueueFor("insert", "location_photos", []);
    if (failure === "transaction") dbMock.transaction.mockRejectedValueOnce(new Error("database unavailable"));
    if (failure === "file write") files.writeFile.mockRejectedValue(new Error("disk full"));
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "POST", url: "/locations/2/photos", ...upload() });

    expect(response.statusCode).toBe(500);
    expect(files.unlink).toHaveBeenCalledTimes(3);
    if (failure === "attachment count")
      expect(dbMock.calls.some((call) => call.table === "location_photos" && call.operation === "insert")).toBe(false);
  });
});
