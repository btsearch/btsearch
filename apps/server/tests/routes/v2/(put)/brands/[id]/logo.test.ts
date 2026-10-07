import { BRAND_LOGO_MAX_BYTES } from "@openbts/shared/contract";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

import route from "../../../../../../src/routes/v2/(put)/brands/[id]/logo.js";
import { dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { multipartPayload } from "../../../../../helpers/multipart.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const files = vi.hoisted(() => ({ mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files, ...files }));

const fileId = "20ddf715-e424-4e63-8c73-cc1326c74b3a";
const previous = { id: 1, slug: "example", name: "Example", color: "#112233", logoFile: "old.svg", logoWidth: 100, logoHeight: 30 };
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><script>alert(1)</script><path d="M0 0h100v30H0z"/></svg>';

function upload(content: string | Buffer = svg) {
  return multipartPayload([{ name: "logo", filename: "logo.svg", content, contentType: "image/svg+xml" }]);
}

function scriptReplacement(extension: "svg" | "webp" = "svg", width = 100, height = 30) {
  dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
  dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
  dbMock.enqueueFor("select", "brands", [previous]);
  dbMock.enqueueFor("update", "brands", [{ ...previous, logoFile: `${fileId}.${extension}`, logoWidth: width, logoHeight: height }]);
  dbMock.enqueueFor("insert", "audit_logs", []);
  dbMock.enqueueFor("select", "audit_logs", []);
  dbMock.enqueueFor("update", "audit_operations", []);
}

describe("PUT /brands/:id/logo", () => {
  beforeEach(() => {
    files.mkdir.mockReset().mockResolvedValue(undefined);
    files.writeFile.mockReset().mockResolvedValue(undefined);
    files.unlink.mockReset().mockResolvedValue(undefined);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(fileId);
  });

  it("stores a sanitized SVG, audits its dimensions, and removes the replaced logo", async () => {
    scriptReplacement();
    const app = await createRouteHarness(route, { session: userSession() });
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload() });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      id: 1,
      slug: "example",
      name: "Example",
      color: "#112233",
      logo: { url: `/uploads/${fileId}.svg`, width: 100, height: 30 },
    });
    expect(files.writeFile).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(new RegExp(`${fileId}\\.svg$`)), expect.any(Buffer));
    const written = files.writeFile.mock.calls[0]?.[1] as Buffer;
    expect(written.toString()).toContain("<svg");
    expect(written.toString()).not.toContain("script");
    expect(files.unlink).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/[\\/]old\.svg$/));
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "brands")?.values).toEqual({
      logoFile: `${fileId}.svg`,
      logoWidth: 100,
      logoHeight: 30,
      updatedAt: expect.any(Date),
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual([
      expect.objectContaining({
        entity: "brands",
        op: "update",
        old_values: previous,
        new_values: expect.objectContaining({ logoFile: `${fileId}.svg` }),
      }),
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("converts an oversized PNG to WebP within the documented dimensions", async () => {
    const png = await sharp({ create: { width: 1536, height: 256, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    scriptReplacement("webp", 768, 128);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload(png) });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.logo).toEqual({ url: `/uploads/${fileId}.webp`, width: 768, height: 128 });
    const written = files.writeFile.mock.calls[0]?.[1] as Buffer;
    expect(await sharp(written).metadata()).toMatchObject({ format: "webp", width: 768, height: 128 });
  });

  it("accepts a WebP at the minimum raster height without enlarging it", async () => {
    const webp = await sharp({ create: { width: 96, height: 48, channels: 3, background: "blue" } })
      .webp()
      .toBuffer();
    scriptReplacement("webp", 96, 48);
    const app = await createRouteHarness(route);

    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload(webp) });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.logo).toMatchObject({ width: 96, height: 48 });
  });

  it("rejects a non-multipart upload before reading or writing the brand", async () => {
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("The logo must be sent as multipart/form-data");
    expect(dbMock.query.brands.findFirst).not.toHaveBeenCalled();
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it("returns 404 before reading image content when the brand is missing", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue(undefined);
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload() })).statusCode).toBe(404);
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects multipart fields without a file", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...multipartPayload([{ name: "logo", content: "text" }]) });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("No file provided");
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed XML", "not an image"],
    ["SVG without dimensions", '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>'],
    ["zero-size SVG", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 30"/>'],
    ["SVG exceeding the maximum side", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100001 30"/>'],
    ["empty file", ""],
  ])("rejects %s before saving files or beginning a transaction", async (_name, content) => {
    dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload(content) });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].code).toBe("BAD_REQUEST");
    expect(files.writeFile).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it.each(["too-short PNG", "unsupported JPEG"])("rejects %s", async (kind) => {
    const image = sharp({ create: { width: 96, height: kind === "too-short PNG" ? 47 : 48, channels: 3, background: "white" } });
    const content = await (kind === "too-short PNG" ? image.png() : image.jpeg()).toBuffer();
    dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload(content) })).statusCode).toBe(400);
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a truncated file over the multipart size limit", async () => {
    dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
    const oversized = Buffer.concat([Buffer.from(svg), Buffer.alloc(BRAND_LOGO_MAX_BYTES, " ")]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload(oversized) });

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].message).toBe("The logo file is too large");
    expect(files.writeFile).not.toHaveBeenCalled();
  });

  it.each(["row removed", "update returned nothing", "database failed", "audit failed", "file write failed"])(
    "removes the new file and preserves the old file when %s",
    async (failure) => {
      dbMock.query.brands.findFirst.mockResolvedValue({ id: 1 });
      dbMock.enqueueFor("insert", "audit_operations", [{ id: 9 }]);
      dbMock.enqueueFor("select", "brands", failure === "row removed" ? [] : [previous]);
      dbMock.enqueueFor(
        "update",
        "brands",
        failure === "update returned nothing"
          ? []
          : failure === "database failed"
            ? new Error("database unavailable")
            : [{ ...previous, logoFile: `${fileId}.svg` }],
      );
      if (failure === "audit failed") dbMock.enqueueFor("insert", "audit_logs", new Error("audit unavailable"));
      if (failure === "file write failed") files.writeFile.mockRejectedValue(new Error("disk full"));
      const app = await createRouteHarness(route);
      const response = await app.inject({ method: "PUT", url: "/brands/1/logo", ...upload() });

      expect(response.statusCode).toBe(failure === "row removed" ? 404 : 500);
      expect(response.json().errors[0].code).toBe(failure === "row removed" ? "NOT_FOUND" : "FAILED_TO_UPDATE");
      expect(files.unlink).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(new RegExp(`${fileId}\\.svg$`)));
    },
  );

  it.each(["0", "-1", "1.5", "abc", "9007199254740992"])("rejects invalid brand id %s before database or file access", async (id) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "PUT", url: `/brands/${id}/logo`, ...upload() })).statusCode).toBe(400);
    expect(dbMock.query.brands.findFirst).not.toHaveBeenCalled();
    expect(files.writeFile).not.toHaveBeenCalled();
  });
});
