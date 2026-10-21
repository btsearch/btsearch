import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getSpectrumHolding from "../../../../../src/routes/v2/(get)/spectrum-holdings/[id].js";
import getSpectrumHoldings from "../../../../../src/routes/v2/(get)/spectrum-holdings/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const pairedRow = {
  id: 5,
  operatorId: 1,
  jointOperatorId: null,
  bandId: 7,
  regionId: null,
  downlinkLowKhz: 1805000,
  downlinkHighKhz: 1835000,
  uplinkLowKhz: 1710000,
  uplinkHighKhz: 1740000,
  validFrom: null,
  validTo: "2037-12-31",
  source: "UKE",
  createdAt: new Date("2026-10-21T00:00:00Z"),
  updatedAt: new Date("2026-10-21T00:00:00Z"),
};
const operator = { id: 1, countryCode: "PL", brandId: null, name: "Plus", full_name: "Polkomtel", shortCode: null, sortPriority: null, mnc: 26001 };
const band = { id: 7, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };
const unpairedRow = { ...pairedRow, id: 6, bandId: 9, downlinkLowKhz: 3400000, downlinkHighKhz: 3500000, uplinkLowKhz: null, uplinkHighKhz: null };

describe("GET /spectrum-holdings", () => {
  it("serializes ranges as kHz pairs and leaves out the uplink of unpaired holdings", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "spectrum_holdings", [pairedRow, unpairedRow]);
    const app = await createRouteHarness(getSpectrumHoldings);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings?countryCodes=PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 5,
          operatorId: 1,
          jointOperatorId: null,
          bandId: 7,
          regionId: null,
          downlinkKhz: [1805000, 1835000],
          uplinkKhz: [1710000, 1740000],
          validFrom: null,
          validTo: "2037-12-31",
          source: "UKE",
        },
        {
          id: 6,
          operatorId: 1,
          jointOperatorId: null,
          bandId: 9,
          regionId: null,
          downlinkKhz: [3400000, 3500000],
          uplinkKhz: null,
          validFrom: null,
          validTo: "2037-12-31",
          source: "UKE",
        },
      ],
    });
  });

  it("narrows the list by operator, band and the day a licence is valid on", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "spectrum_holdings", []);
    const app = await createRouteHarness(getSpectrumHoldings);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings?operatorIds=1&bandIds=7&activeOn=2026-10-21" });
    expect(response.statusCode).toBe(200);
    const where = dbMock.calls.find((call) => call.table === "spectrum_holdings")?.clauses.where?.[0] as SQL;
    const { sql, params } = new PgDialect().sqlToQuery(where);
    expect(params).toEqual(expect.arrayContaining(["PL", 1, 7, "2026-10-21"]));
    expect(sql).toContain('"valid_from" is null');
    expect(sql).toContain('"valid_to" is null');
    expect(sql).toContain('"joint_operator_id" in');
  });

  it("embeds the operator and the band with include", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "spectrum_holdings", [pairedRow]);
    dbMock.enqueueFor("select", "operators", [operator]);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "operator_links", []);
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getSpectrumHoldings);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings?include=operator,band" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      id: 5,
      operator: { id: 1, name: "Plus" },
      jointOperator: null,
      band: { id: 7, rat: "lte", number: 3 },
    });
  });

  it("embeds the joint operator of a jointly held licence", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "spectrum_holdings", [{ ...pairedRow, jointOperatorId: 2 }]);
    dbMock.enqueueFor("select", "operators", [operator, { ...operator, id: 2, name: "Play", mnc: 26006 }]);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "operator_links", []);
    const app = await createRouteHarness(getSpectrumHoldings);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings?include=operator" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ operatorId: 1, jointOperatorId: 2, operator: { id: 1 }, jointOperator: { id: 2, name: "Play" } });
  });

  it("answers an empty list without reading holdings when no requested country is visible", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    const app = await createRouteHarness(getSpectrumHoldings);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings?countryCodes=DE" });
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.some((call) => call.table === "spectrum_holdings")).toBe(false);
  });
});

describe("GET /spectrum-holdings/:id", () => {
  it("returns a holding of a visible country with its band", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue({ ...pairedRow, operator: { countryCode: "PL" } });
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getSpectrumHolding);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings/5?include=band" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 5, downlinkKhz: [1805000, 1835000], band: { id: 7 } });
    expect(response.json().data).not.toHaveProperty("operator");
  });

  it.each([true, false])("hides a missing holding or one of a hidden country (exists: %s)", async (exists) => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(exists ? { ...pairedRow, operator: { countryCode: "PL" } } : undefined);
    if (exists) dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getSpectrumHolding);

    const response = await app.inject({ method: "GET", url: "/spectrum-holdings/5" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
