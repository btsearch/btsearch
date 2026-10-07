import { afterAll, describe, expect, it, vi } from "vitest";

import reverseGeocoding from "../../../../../src/routes/v2/(get)/geocoding/reverse.js";
import searchGeocoding from "../../../../../src/routes/v2/(get)/geocoding/search.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const originalEnv = vi.hoisted(() => {
  const keys = { geoapify: process.env.GEOAPIFY_API_KEY, locationiq: process.env.LOCATIONIQ_API_KEY };
  process.env.GEOAPIFY_API_KEY = "";
  process.env.LOCATIONIQ_API_KEY = "";
  return keys;
});

afterAll(() => {
  if (originalEnv.geoapify === undefined) delete process.env.GEOAPIFY_API_KEY;
  else process.env.GEOAPIFY_API_KEY = originalEnv.geoapify;
  if (originalEnv.locationiq === undefined) delete process.env.LOCATIONIQ_API_KEY;
  else process.env.LOCATIONIQ_API_KEY = originalEnv.locationiq;
});

describe("geocoding without providers", () => {
  it.each([
    [searchGeocoding, "/geocoding/search?q=Łódź", []],
    [reverseGeocoding, "/geocoding/reverse?latitude=52&longitude=21", null],
  ] as const)("returns the route's empty result without sending HTTP requests: %s", async (route, url, data) => {
    const fetch = vi.fn().mockRejectedValue(new Error("Unexpected HTTP request"));
    vi.stubGlobal("fetch", fetch);
    const app = await createRouteHarness(route);
    const response = await app.inject({ url, headers: { "sec-fetch-site": "same-origin" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data });
    expect(fetch).not.toHaveBeenCalled();
  });
});
