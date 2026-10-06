import type { ObservedCell } from "@openbts/shared/contract";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { getRuntimeSettings } from "../../../../../src/lib/runtimeSettings.js";
import route from "../../../../../src/routes/v2/(post)/cells/match.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const plmn = "26001";
const observed: ObservedCell[] = [
  { rat: "gsm", plmn, lac: 1, cid: 2 },
  { rat: "umts", plmn, lac: 1, cid: 2, rnc: 3 },
  { rat: "lte", plmn, enbid: 100, clid: 2 },
  { rat: "nr", plmn, gnbid: 200, clid: 2 },
];

function network(partners: { operatorId: number; ventureId: number }[] = []) {
  dbMock.enqueueFor("select", "countries", []);
  dbMock.enqueueFor("select", "plmns", [{ code: plmn, operatorId: 1, legacyMnc: 1, countryCode: "PL" }]);
  dbMock.enqueueFor("select", "operator_links", partners);
}

function stored(rat: string, id = 10, operatorId = 1) {
  return {
    cell: { id, station_id: 20, band_id: 1 },
    operatorId,
    gsm: rat === "gsm" ? { lac: 1, cid: 2, bsic: null } : null,
    umts: rat === "umts" ? { lac: 1, cid: 2, rnc: 3, psc: null, arfcn: null } : null,
    lte: rat === "lte" ? { enbid: 100, clid: 2, tac: null, pci: null, earfcn: null } : null,
    nr: rat === "nr" ? { gnbid: 200, clid: 2, nci: 819202n, nrtac: null, pci: null, arfcn: null } : null,
  };
}

describe("POST /cells/match", () => {
  it("returns one operatorUnknown result per observation in the original order", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "plmns", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match?include=stations,cells,officialSites", payload: { cells: observed } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      results: observed.map(() => ({
        operatorId: null,
        match: "none",
        reason: "operatorUnknown",
        stationId: null,
        cellId: null,
        isShared: false,
        differences: [],
        nrIdentity: null,
        officialSiteIds: [],
      })),
      stations: [],
      cells: [],
      officialSites: [],
    });
    expect(dbMock.calls.some((call) => call.table === "cells")).toBe(false);
    expect(dbMock.calls.filter((call) => call.operation === "insert" && call.table !== "analyzer_usage")).toEqual([]);
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  });

  it.each(observed.map((cell) => [cell.rat, cell] as const))("matches an exact %s cell on an active station", async (_rat, cell) => {
    network();
    dbMock.enqueueFor("select", "cells", [stored(cell.rat)]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [cell] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      results: [
        {
          operatorId: 1,
          match: "cell",
          reason: null,
          stationId: 20,
          cellId: 10,
          isShared: false,
          differences: [],
          nrIdentity: cell.rat === "nr" ? { gnbid: 200, clid: 2 } : null,
        },
      ],
    });
    const query = dbMock.calls.find((call) => call.table === "cells")?.clauses.where?.[0];
    const sql = new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(sql.params).toContain("published");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("treats a network in a hidden country as unknown", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "DE" }]);
    dbMock.enqueueFor("select", "plmns", [{ code: plmn, operatorId: 1, legacyMnc: 1, countryCode: "DE" }]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [observed[0]] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({ operatorId: null, reason: "operatorUnknown" });
    expect(dbMock.calls.some((call) => call.table === "cells")).toBe(false);
  });

  it.each([undefined, null, 0, 4])("falls back to a UMTS cell's LAC and CID when RNC %s has no exact match", async (rnc) => {
    network();
    if (rnc === 4) dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("select", "cells", [stored("umts")]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [{ rat: "umts", plmn, lac: 1, cid: 2, rnc }] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({
      match: "cellByLac",
      cellId: 10,
      differences: rnc === 4 ? [{ field: "rnc", observed: 4, stored: 3 }] : [],
    });
  });

  it.each(["lte", "nr"])("returns a known %s station when the observed cell is not stored", async (rat) => {
    network();
    if (rat === "lte") dbMock.enqueueFor("select", "cells", []);
    const row = stored(rat);
    dbMock.enqueueFor("select", "cells", [rat === "lte" ? { ...row, lte: { ...row.lte, clid: 8 } } : { ...row, nr: { ...row.nr, clid: 8 } }]);
    const cell = observed.find((item) => item.rat === rat);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [cell] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({ match: "station", stationId: 20, cellId: null, reason: null });
  });

  it.each([
    { rat: "lte", plmn, enbid: 0, clid: 0 },
    { rat: "nr", plmn },
    { rat: "nr", plmn, nci: 0 },
    { rat: "nr", plmn, gnbid: 0, clid: 0 },
  ])("reports missing identifiers for %j", async (cell) => {
    network();
    if ("nci" in cell) dbMock.enqueueFor("select", "cells", []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [cell] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({ match: "none", reason: "noIdentifiers", operatorId: 1, nrIdentity: null });
  });

  it("uses the stored NR split when an NCI has a non-default gNBID length", async () => {
    network();
    dbMock.enqueueFor("select", "cells", [], [{ ...stored("nr"), nr: { gnbid: 400, clid: 2, nci: 819202n, nrtac: null, pci: null, arfcn: null } }]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [{ rat: "nr", plmn, nci: 819202 }] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({ match: "cell", cellId: 10, nrIdentity: { gnbid: 400, clid: 2 } });
  });

  it.each([true, false])("reports a BSIC difference only when the feature is enabled (%s)", async (enabled) => {
    getRuntimeSettings().bsicEnabled = enabled;
    network();
    dbMock.enqueueFor("select", "cells", [stored("gsm")]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [{ ...observed[0], bsic: 12 }] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0].differences).toEqual(enabled ? [{ field: "bsic", observed: 12, stored: null }] : []);
  });

  it("reports LTE observed values that differ from stored values while ignoring omitted fields", async () => {
    network();
    dbMock.enqueueFor("select", "cells", [{ ...stored("lte"), lte: { enbid: 100, clid: 2, tac: 5, pci: 7, earfcn: 9 } }]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [{ ...observed[2], tac: 6, pci: null }] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0].differences).toEqual([{ field: "tac", observed: 6, stored: 5 }]);
  });

  it.each([true, false])("prefers an operator's own LTE cell over a shared partner's cell when own=%s", async (own) => {
    network([
      { operatorId: 1, ventureId: 99 },
      { operatorId: 2, ventureId: 99 },
    ]);
    dbMock.enqueueFor("select", "cells", [stored("lte", 5, 2), ...(own ? [stored("lte", 20, 1)] : [])]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [observed[2]] } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0]).toMatchObject({ cellId: own ? 20 : 5, isShared: !own });
  });

  it("chooses the lowest cell id when duplicate stored identifiers have the same operator", async () => {
    network();
    dbMock.enqueueFor("select", "cells", [stored("gsm", 20), stored("gsm", 5)]);
    const app = await createRouteHarness(route);

    const response = await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [observed[0]] } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.results[0].cellId).toBe(5);
  });

  it.each([
    ["empty observations", { cells: [] }],
    ["too many observations", { cells: Array.from({ length: 5001 }, () => observed[0]) }],
    ["unknown top-level field", { cells: [observed[0]], extra: true }],
    ["invalid PLMN", { cells: [{ ...observed[0], plmn: "260A1" }] }],
    ["unpaired gNBID", { cells: [{ rat: "nr", plmn, gnbid: 1 }] }],
    ["unpaired CLID", { cells: [{ rat: "nr", plmn, clid: 1 }] }],
    ["unsupported technology", { cells: [{ rat: "wifi", plmn }] }],
    ["out-of-range GSM LAC", { cells: [{ ...observed[0], lac: 65536 }] }],
    ["out-of-range UMTS PSC", { cells: [{ ...observed[1], psc: 512 }] }],
    ["out-of-range LTE PCI", { cells: [{ ...observed[2], pci: 504 }] }],
    ["out-of-range NR NCI", { cells: [{ rat: "nr", plmn, nci: 68719476736 }] }],
    ["out-of-range NR ARFCN", { cells: [{ ...observed[3], arfcn: 3279166 }] }],
    ["negative identifier", { cells: [{ ...observed[0], cid: -1 }] }],
    ["fractional identifier", { cells: [{ ...observed[2], enbid: 1.5 }] }],
    ["unknown technology field", { cells: [{ ...observed[0], nci: 1 }] }],
  ])("rejects %s before database lookup", async (_name, payload) => {
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/cells/match", payload })).statusCode).toBe(400);
    expect(dbMock.calls).toEqual([]);
  });

  it("does not return successful matches when the network lookup fails", async () => {
    dbMock.enqueueFor("select", "countries", []);
    dbMock.enqueueFor("select", "plmns", new Error("database unavailable"));
    const app = await createRouteHarness(route);

    expect((await app.inject({ method: "POST", url: "/cells/match", payload: { cells: [observed[0]] } })).statusCode).toBe(500);
  });
});
