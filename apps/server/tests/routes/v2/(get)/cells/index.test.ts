import { stations } from "@openbts/drizzle";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getCell from "../../../../../src/routes/v2/(get)/cells/[id].js";
import getCells from "../../../../../src/routes/v2/(get)/cells/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { readCell, readStation } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const stationTable = getTableName(stations);
const band = { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };

describe("getCells", () => {
  it.each([false, true])("returns the selected cell page with include=band and totals=%s", async (includeTotal) => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [
      { ...readCell, key: 1 },
      { ...readCell, cell: { ...readCell.cell, id: 2 }, key: 2 },
    ]);
    if (includeTotal) dbMock.enqueueFor("select", "cells", [{ total: 6 }]);
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getCells);
    const response = await app.inject({ method: "GET", url: `/cells?limit=1&include=band&includeTotal=${includeTotal}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0]).toMatchObject({
      id: 1,
      rat: "lte",
      cellType: "macro",
      enbid: 100,
      clid: 1,
      eci: 25601,
      pci: 0,
      tac: 0,
      band: { id: 3, rat: "lte" },
    });
    expect(response.json().paging).toMatchObject({ limit: 1, nextCursor: expect.any(String) });
    if (includeTotal) expect(response.json().paging.total).toBe(6);
    else expect(response.json().paging).not.toHaveProperty("total");
  });

  it("filters station status and RAT together while permitting an unknown band", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", []);
    const app = await createRouteHarness(getCells);
    const response = await app.inject({ method: "GET", url: "/cells?statuses=inactive&rats=nr&bandIds=unknown&stationIds=1" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    const where = dbMock.calls.find((call) => call.table === "cells")?.clauses.where?.[0] as SQL;
    const query = new PgDialect().sqlToQuery(where);
    expect(query.params).toEqual(expect.arrayContaining(["inactive", "NR", 0, 1]));
    expect(query.sql).toContain("CASE");
  });

  it.each(["limit=1001", "cursor=x&offset=0", "stationIds=0", "rats=LTE", "include=operator"])(
    "rejects invalid cell list queries: %s",
    async (query) => {
      const app = await createRouteHarness(getCells);
      expect((await app.inject({ method: "GET", url: `/cells?${query}` })).statusCode).toBe(400);
      expect(dbMock.calls).toHaveLength(0);
    },
  );
});

describe("getCell", () => {
  it("clears legacy unknown identities and the unknown-band sentinel", async () => {
    dbMock.enqueueFor("select", "cells", [{ ...readCell, lte: { ...readCell.lte, enbid: 0, clid: 0, ecid: 0 } }]);
    dbMock.enqueueFor("select", stationTable, [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "bands", [{ ...band, value: 0 }]);
    const app = await createRouteHarness(getCell);
    const response = await app.inject({ method: "GET", url: "/cells/1?include=band" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ id: 1, bandId: null, enbid: null, clid: null, eci: null });
    expect(response.json().data).not.toHaveProperty("band");
  });

  it.each(["cell", "radio", "station"])("returns 404 when the %s needed for a cell is missing", async (missing) => {
    dbMock.enqueueFor("select", "cells", missing === "cell" ? [] : [{ ...readCell, lte: missing === "radio" ? null : readCell.lte }]);
    if (missing !== "cell") dbMock.enqueueFor("select", stationTable, missing === "station" ? [] : [{ station: readStation, countryCode: null }]);
    if (missing === "radio") dbMock.enqueueFor("select", "bands", []);
    const app = await createRouteHarness(getCell);
    const response = await app.inject({ method: "GET", url: "/cells/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
