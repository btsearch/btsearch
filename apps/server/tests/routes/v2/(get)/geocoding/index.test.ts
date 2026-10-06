import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import reverseGeocoding from "../../../../../src/routes/v2/(get)/geocoding/reverse.js";
import searchGeocoding from "../../../../../src/routes/v2/(get)/geocoding/search.js";
import { redisMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const originalEnv = vi.hoisted(() => {
  const keys = { geoapify: process.env.GEOAPIFY_API_KEY, locationiq: process.env.LOCATIONIQ_API_KEY };
  process.env.GEOAPIFY_API_KEY = "unit-test-key";
  process.env.LOCATIONIQ_API_KEY = "";
  return keys;
});
const headers = { "sec-fetch-site": "same-origin" };
let day = 0;

beforeEach(() => {
  redisMock.isReady = false;
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-06T10:00:00Z") + day++ * 86_400_000);
});

afterAll(() => {
  if (originalEnv.geoapify === undefined) delete process.env.GEOAPIFY_API_KEY;
  else process.env.GEOAPIFY_API_KEY = originalEnv.geoapify;
  if (originalEnv.locationiq === undefined) delete process.env.LOCATIONIQ_API_KEY;
  else process.env.LOCATIONIQ_API_KEY = originalEnv.locationiq;
});

describe("searchGeocoding", () => {
  it("normalizes the query and scope and drops malformed provider rows", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { place_id: "1", result_type: "city", name: "Łódź", lat: 51.77, lon: 19.46, country_code: "pl", city: "Łódź", country: "Poland" },
            { name: "Missing coordinates" },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const app = await createRouteHarness(searchGeocoding);
    const response = await app.inject({ url: "/geocoding/search?q=%20Łódź%20%20centrum%20&countryCodes=PL,US&language=zz", headers });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      source: "geoapify",
      kind: "city",
      latitude: 51.77,
      longitude: 19.46,
      address: { countryCode: "PL" },
    });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("text")).toBe("Łódź centrum");
    expect(url.searchParams.get("filter")).toBe("countrycode:pl,us");
    expect(url.searchParams.get("lang")).toBe("en");
  });

  it.each([new Response("{}", { status: 500 }), new Response(JSON.stringify({ results: "invalid" }), { status: 200 })])(
    "returns service unavailable when the only provider fails",
    async (providerResponse) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse));
      const app = await createRouteHarness(searchGeocoding);
      const response = await app.inject({ url: "/geocoding/search?q=Łódź", headers });
      expect(response.statusCode).toBe(503);
      expect(response.json().errors[0].code).toBe("SERVICE_UNAVAILABLE");
    },
  );

  it.each(["/geocoding/search", "/geocoding/search?q=valid"])("checks first-party access before query validation: %s", async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const app = await createRouteHarness(searchGeocoding);
    expect((await app.inject({ url })).statusCode).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("reverseGeocoding", () => {
  it.each([false, true])("returns a normalized result or a genuine no-match result (%s)", async (found) => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: found ? [{ lat: 52.12346, lon: 21.12346, name: "Address", country_code: "invalid" }] : [] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const app = await createRouteHarness(reverseGeocoding);
    const response = await app.inject({ url: "/geocoding/reverse?latitude=52.123456&longitude=21.123456&language=pl", headers });
    expect(response.statusCode).toBe(200);
    if (found) expect(response.json().data).toMatchObject({ source: "geoapify", address: { countryCode: null } });
    else expect(response.json().data).toBeNull();
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("lat")).toBe("52.12346");
    expect(url.searchParams.get("lon")).toBe("21.12346");
  });

  it.each(["latitude=91&longitude=0", "latitude=0", "latitude=0&longitude=1e2", "latitude=0&longitude=0&language=PL"])(
    "rejects invalid coordinates or locale: %s",
    async (query) => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const app = await createRouteHarness(reverseGeocoding);
      expect((await app.inject({ url: `/geocoding/reverse?${query}`, headers })).statusCode).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
