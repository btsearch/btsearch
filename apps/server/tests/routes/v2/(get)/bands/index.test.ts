import { countries } from "@openbts/drizzle";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getBand from "../../../../../src/routes/v2/(get)/bands/[id].js";
import getBands from "../../../../../src/routes/v2/(get)/bands/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const band = { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };

describe("getBands", () => {
  it("intersects requested technologies with the visible countries' band plans", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getBands);
    const response = await app.inject({ url: "/bands?rats=lte,nr&countryCodes=PL,US" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject([{ id: 3, rat: "lte", number: 3 }]);
    const where = dbMock.calls.find((call) => call.table === "bands")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params).toEqual(["LTE", "NR", "PL"]);
    expect(query.sql).toContain('"country_bands"');
    expect(query.sql).toContain("IS DISTINCT FROM 0");
  });

  it("serializes catalogue frequencies and the stored band label", async () => {
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getBands);
    const response = await app.inject({ method: "GET", url: "/bands" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 3,
          rat: "lte",
          code: "B3",
          number: 3,
          name: "1800",
          labelMhz: 1800,
          duplex: "fdd",
          variant: "commercial",
          downlinkKhz: [1805000, 1880000],
          uplinkKhz: [1710000, 1785000],
        },
      ],
    });
  });

  it.each([[[]], [[{ code: "PL", isVisible: false }]]])("returns an empty collection for unavailable country plans %j", async (rows) => {
    dbMock.enqueueFor("select", getTableName(countries), rows);
    const app = await createRouteHarness(getBands);
    const response = await app.inject({ method: "GET", url: "/bands?countryCodes=PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.filter((call) => call.table === "bands")).toHaveLength(0);
  });

  it.each(["rats=LTE", "rats=lte,unknown", "countryCodes=pl", "countryCodes=PL,", "extra=1"])(
    "rejects unsupported filters before querying: %s",
    async (query) => {
      const app = await createRouteHarness(getBands);
      const response = await app.inject({ method: "GET", url: `/bands?${query}` });
      expect(response.statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );

  it("returns the declared error envelope when the database fails", async () => {
    dbMock.enqueueFor("select", "bands", new Error("database offline"));
    const app = await createRouteHarness(getBands);
    const response = await app.inject({ method: "GET", url: "/bands" });
    expect(response.statusCode).toBe(500);
    expect(response.json().errors[0].code).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("getBand", () => {
  it("returns a band with no catalogue code without inventing frequencies", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue({ ...band, code: null, value: null, duplex: null });
    const app = await createRouteHarness(getBand);
    const response = await app.inject({ method: "GET", url: "/bands/3" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 3, code: null, number: null, labelMhz: null, duplex: null, downlinkKhz: null, uplinkKhz: null });
    expect(dbMock.query.bands.findFirst).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it.each([undefined, { ...band, value: 0 }])("hides missing bands and the unknown-band sentinel %j", async (row) => {
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    const app = await createRouteHarness(getBand);
    const response = await app.inject({ method: "GET", url: "/bands/3" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });

  it.each(["0", "-1", "1.5", "2147483648", "abc"])("rejects invalid path id %s before database access", async (id) => {
    const app = await createRouteHarness(getBand);
    const response = await app.inject({ method: "GET", url: `/bands/${id}` });
    expect(response.statusCode).toBe(400);
    expect(dbMock.query.bands.findFirst).not.toHaveBeenCalled();
  });
});
