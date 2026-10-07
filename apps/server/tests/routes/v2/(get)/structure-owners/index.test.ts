import { describe, expect, it } from "vitest";

import getStructureOwners from "../../../../../src/routes/v2/(get)/structure-owners/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

describe("getStructureOwners", () => {
  it.each([[[]], [[{ code: "PL", isVisible: true }]]])("keeps global owners even when country selection is empty %j", async (countries) => {
    const owner = { id: 1, name: "Global", countryCode: null, brandId: null, operatorId: null };
    dbMock.enqueueFor("select", "countries", countries);
    dbMock.enqueueFor("select", "structure_owners", [owner]);
    const app = await createRouteHarness(getStructureOwners);
    const response = await app.inject({ method: "GET", url: "/structure-owners?countryCodes=PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [owner] });
  });

  it("returns an empty collection when no owners exist", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "structure_owners", []);
    const app = await createRouteHarness(getStructureOwners);
    expect((await app.inject({ method: "GET", url: "/structure-owners" })).json()).toEqual({ data: [] });
  });
});
