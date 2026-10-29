import { curatedCellSummaries, stations } from "@openbts/drizzle";
import { type SQL, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import getCell from "../../../../../src/routes/v2/(get)/cells/[id].js";
import getCells from "../../../../../src/routes/v2/(get)/cells/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { readCell, readStation } from "../../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const stationTable = getTableName(stations);
const summaryTable = getTableName(curatedCellSummaries);
const band = { id: 3, rat: "LTE", code: "B3", name: "1800", value: 1800, duplex: "FDD", variant: "commercial" };
const umtsCell = {
  ...readCell,
  cell: { ...readCell.cell, id: 2, rat: "UMTS" },
  lte: null,
  umts: { lac: 10, rnc: 2, cid: 3, cid_long: 131075, psc: null, arfcn: 10700 },
};

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
  });

  it("adds the days phones saw each cell, its confirmed bandwidth except on UMTS, and null for a cell no phone saw", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "cells", [
      { ...readCell, key: 1 },
      { ...umtsCell, key: 2 },
      { ...readCell, cell: { ...readCell.cell, id: 3 }, key: 3 },
      { ...readCell, cell: { ...readCell.cell, id: 4 }, key: 4 },
    ]);
    dbMock.enqueueFor("select", "bands", [band]);
    dbMock.enqueueFor("select", summaryTable, [
      { cellId: 1, rat: "LTE", firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 },
      { cellId: 2, rat: "UMTS", firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-02", bandwidthKhz: 5000 },
      { cellId: 3, rat: "LTE", firstSeenOn: "2026-10-05", lastSeenOn: "2026-10-05", bandwidthKhz: null },
    ]);
    const app = await createRouteHarness(getCells);
    const response = await app.inject({ method: "GET", url: "/cells?include=sightings" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((cell: { id: number; sightings: unknown }) => [cell.id, cell.sightings])).toEqual([
      [1, { firstSeenOn: "2026-10-22", lastSeenOn: "2026-10-30", bandwidthKhz: 20000 }],
      [2, { firstSeenOn: "2026-10-01", lastSeenOn: "2026-10-02", bandwidthKhz: null }],
      [3, { firstSeenOn: "2026-10-05", lastSeenOn: "2026-10-05", bandwidthKhz: null }],
      [4, null],
    ]);
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

  it("leaves sightings out, and does not read them, without include=sightings", async () => {
    dbMock.enqueueFor("select", "cells", [readCell]);
    dbMock.enqueueFor("select", stationTable, [{ station: readStation, countryCode: null }]);
    dbMock.enqueueFor("select", "bands", [band]);
    const app = await createRouteHarness(getCell);
    const response = await app.inject({ method: "GET", url: "/cells/1?include=band" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).not.toHaveProperty("sightings");
    expect(dbMock.calls.some((call) => call.table === summaryTable)).toBe(false);
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
