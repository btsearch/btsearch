import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readBoundaryInput } from "../../../src/scripts/importRegionBoundaries/input.js";

const geojson = { type: "FeatureCollection", features: [] };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function fetchTargetUrl(target: Parameters<typeof fetch>[0] | undefined): string | undefined {
  if (target === undefined || typeof target === "string") return target;
  if ("href" in target) return target.href;
  return target.url;
}

describe("readBoundaryInput", () => {
  it("reads a local GeoJSON file and preserves its basename as the source", async () => {
    const file = fileURLToPath(new URL("../../../src/scripts/importRegionBoundaries/poland.voivodeships.max.json", import.meta.url));
    const { data, source } = await readBoundaryInput(file, undefined);

    expect(source).toBe("poland.voivodeships.max.json");
    expect(data).toHaveProperty("type", "FeatureCollection");
    expect(data).toHaveProperty("features.length", 16);
  });

  it("downloads JSON and preserves the complete query while sanitizing the source", async () => {
    const url = "https://reader:password@example.test/regions.geojson?where=1%3D1&token=secret#download";
    const fetchMock = mockFetch(new Response(JSON.stringify(geojson)));

    await expect(readBoundaryInput(undefined, url)).resolves.toEqual({
      data: geojson,
      source: "https://example.test/regions.geojson",
    });
    const [target, options] = fetchMock.mock.calls[0] ?? [];
    expect(fetchTargetUrl(target)).toBe(url);
    expect(options?.redirect).toBe("follow");
    expect(options?.headers).toEqual({ Accept: "application/geo+json, application/json" });
    expect(options?.signal?.aborted).toBe(false);
  });

  it("accepts an HTTP URL through --file", async () => {
    const url = "http://example.test/regions?f=geojson";
    mockFetch(new Response(JSON.stringify(geojson)));

    await expect(readBoundaryInput(url, undefined)).resolves.toEqual({
      data: geojson,
      source: "http://example.test/regions",
    });
  });

  it("bounds long source labels while fetching the complete URL", async () => {
    const url = `https://example.test/regions/${"section-".repeat(40)}?token=secret`;
    const fetchMock = mockFetch(new Response(JSON.stringify(geojson)));
    const { source } = await readBoundaryInput(undefined, url);

    expect(source.length).toBeLessThanOrEqual(200);
    expect(source).toMatch(/^https:\/\/example\.test\/regions\//);
    expect(source).not.toContain("secret");
    expect(fetchTargetUrl(fetchMock.mock.calls[0]?.[0])).toBe(url);
  });

  it("requires an input", async () => {
    await expect(readBoundaryInput(undefined, undefined)).rejects.toThrow(/file|url|input/i);
  });

  it("rejects simultaneous file and URL inputs", async () => {
    await expect(readBoundaryInput("regions.geojson", "https://example.test/regions")).rejects.toThrow(/both|one|either/i);
  });

  it.each(["ftp://example.test/regions.geojson", "file:///regions.geojson", "data://regions"])(
    "rejects unsupported --url protocol %s",
    async (url) => {
      await expect(readBoundaryInput(undefined, url)).rejects.toThrow(/https?|protocol|scheme/i);
    },
  );

  it("rejects a local path passed through --url", async () => {
    await expect(readBoundaryInput(undefined, "regions.geojson")).rejects.toThrow(/url|https?/i);
  });

  it("reports HTTP errors without exposing query secrets or the response body", async () => {
    mockFetch(new Response("private-response-content", { status: 403 }));
    const error: unknown = await readBoundaryInput(undefined, "https://example.test/regions?token=secret").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("403");
    expect(String(error)).not.toContain("example.test");
    expect(String(error)).not.toContain("secret");
    expect(String(error)).not.toContain("private-response-content");
  });

  it("reports an export that is still being generated", async () => {
    mockFetch(new Response("", { status: 202 }));

    await expect(readBoundaryInput(undefined, "https://example.test/regions")).rejects.toThrow(/not ready/i);
  });

  it("reports successful responses containing invalid JSON", async () => {
    mockFetch(new Response("<html>download failed</html>"));

    await expect(readBoundaryInput(undefined, "https://example.test/regions")).rejects.toThrow(/JSON/i);
  });

  it("reports connection failures without exposing the URL or the original error", async () => {
    const url = "https://example.test/regions?token=secret";
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error(`Private network error for ${url}`));
    vi.stubGlobal("fetch", fetchMock);
    const error: unknown = await readBoundaryInput(undefined, url).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/download|connection|request/i);
    expect(String(error)).not.toContain("example.test");
    expect(String(error)).not.toContain("secret");
    expect(String(error)).not.toContain("Private network error");
  });
});
