import { describe, expect, it } from "vitest";

import { PERMIT_BAND_ORDER } from "../../../../../../src/features/permits/bands.js";
import route from "../../../../../../src/routes/v1/(get)/uke/bands/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

describe("GET /uke/bands", () => {
  it("returns permit labels with their original ids and all v1 band keys for guests", async () => {
    const rows = [
      { id: 1, rat: "GSM", value: 900, variant: "commercial", name: "GSM 900" },
      { id: 2, rat: "GSM", value: 900, variant: "railway", name: "GSM-R 900" },
      { id: 4, rat: "CDMA", value: 420, variant: "commercial", name: "CDMA 420" },
      { id: 9, rat: "LTE", value: 1800, variant: "commercial", name: "LTE 1800" },
      { id: 15, rat: "IOT", value: 800, variant: "commercial", name: "IOT 800" },
    ];
    dbMock.enqueueFor("select", "uke_bands", rows);
    const app = await createRouteHarness(route, { runAuth: true });
    const response = await app.inject({ url: "/uke/bands" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: rows.map((row) => ({ ...row, duplex: null, code: null })) });
    expect(Object.keys(response.json().data[0]).sort()).toEqual(["code", "duplex", "id", "name", "rat", "value", "variant"]);
    expect(dbMock.calls[0]?.clauses.orderBy).toEqual(PERMIT_BAND_ORDER);
    expect(dbMock.calls.some((call) => call.table === "bands" || call.table === "country_bands")).toBe(false);
  });

  it("returns an empty collection when no permit labels exist", async () => {
    dbMock.enqueueFor("select", "uke_bands", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ url: "/uke/bands" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
  });

  it("returns the existing error envelope when labels cannot be read", async () => {
    dbMock.enqueueFor("select", "uke_bands", new Error("Database unavailable"));
    const app = await createRouteHarness(route);
    const response = await app.inject({ url: "/uke/bands" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ errors: [{ code: "INTERNAL_SERVER_ERROR" }] });
  });
});
