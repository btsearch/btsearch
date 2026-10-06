import { describe, expect, it } from "vitest";

import getBrands from "../../../../../src/routes/v2/(get)/brands/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getBrands", () => {
  it.each([
    ["brand.svg", 100, 30, { url: "/uploads/brand.svg", width: 100, height: 30 }],
    [null, 100, 30, null],
    ["brand.svg", null, 30, null],
    ["brand.svg", 100, null, null],
  ])("exposes a logo only when all stored logo fields exist (%s,%s,%s)", async (logoFile, logoWidth, logoHeight, logo) => {
    dbMock.enqueueFor("select", "brands", [{ id: 1, slug: "example", name: "Łódź", color: "#112233", logoFile, logoWidth, logoHeight }]);
    const app = await createRouteHarness(getBrands);
    const response = await app.inject({ method: "GET", url: "/brands" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [{ id: 1, slug: "example", name: "Łódź", color: "#112233", logo }] });
  });

  it("returns an empty collection without treating it as a missing resource", async () => {
    dbMock.enqueueFor("select", "brands", []);
    const app = await createRouteHarness(getBrands);
    const response = await app.inject({ method: "GET", url: "/brands" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
  });

  it("rejects undeclared filters before querying", async () => {
    const app = await createRouteHarness(getBrands);
    expect((await app.inject({ method: "GET", url: "/brands?countryCodes=PL" })).statusCode).toBe(400);
    expect(dbMock.calls).toHaveLength(0);
  });
});
