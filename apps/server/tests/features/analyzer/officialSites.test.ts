import { describe, expect, it } from "vitest";

import route from "../../../src/routes/v2/(post)/cells/match.js";
import { logger } from "../../../src/utils/logger.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";
import { cacheCountryVisibility, cacheSourceVisibility } from "../../helpers/officialDataFixtures.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";
import { createRouteHarness } from "../../helpers/routeHarness.js";

type TestOperator = { id: number; plmn: string; countryCode: string; ventureId?: number };

const PLUS: TestOperator = { id: 1, plmn: "26001", countryCode: "PL" };
const TMOBILE: TestOperator = { id: 2, plmn: "26002", countryCode: "PL", ventureId: 34 };
const ORANGE: TestOperator = { id: 3, plmn: "26003", countryCode: "PL", ventureId: 34 };
const PLAY: TestOperator = { id: 6, plmn: "26006", countryCode: "PL" };
const ELSEWHERE: TestOperator = { id: 50, plmn: "26201", countryCode: "DE" };
const SHARED_NETWORK_PLMN = "26034";
const URL = "/cells/match?include=officialSites";

function networks(observed: readonly TestOperator[], members: readonly TestOperator[] = observed) {
  const ventureIds = [...new Set(observed.flatMap((operator) => operator.ventureId ?? []))];
  const shared = members.filter((operator) => operator.ventureId !== undefined);

  cacheCountryVisibility();
  dbMock.enqueueFor(
    "select",
    "plmns",
    observed.map(({ id, plmn, countryCode }) => ({ code: plmn, operatorId: id, countryCode })),
  );
  dbMock.enqueueFor(
    "select",
    "operator_links",
    shared.map(({ id, ventureId }) => ({ operatorId: id, ventureId })),
  );
  dbMock.enqueueFor(
    "select",
    "operators",
    observed.map(({ id, countryCode }) => operatorRow(id, null, countryCode)),
    ventureIds.map((id) => operatorRow(id, null)),
  );
  dbMock.enqueueFor(
    "select",
    "plmns",
    observed.map(({ id, plmn }) => primaryPlmn(id, plmn)),
    ventureIds.map((id) => primaryPlmn(id, SHARED_NETWORK_PLMN)),
  );
  dbMock.enqueueFor(
    "select",
    "operator_links",
    observed.flatMap(({ id, ventureId }) => (ventureId === undefined ? [] : [{ operatorId: id, kind: "jv_member", relatedOperatorId: ventureId }])),
  );
}

function noStoredCells(lookups: number) {
  dbMock.enqueueFor("select", "cells", ...Array.from({ length: lookups }, () => []));
}

function lte(operator: TestOperator, enbid: number, clid = 1) {
  return { rat: "lte", plmn: operator.plmn, enbid, clid };
}

function officialSite(id: number, operatorId: number) {
  return {
    id,
    sourceKey: "pl-uke",
    siteId: `BT${id}`,
    operatorId,
    regionId: 7,
    latitude: 52.2297,
    longitude: 21.0122,
    city: "Warszawa",
    address: null,
  };
}

function officialSiteRef(id: number, operatorId: number) {
  return {
    id,
    sourceKey: "pl-uke",
    siteId: `BT${id}`,
    operatorId,
    regionId: 7,
    location: { latitude: 52.2297, longitude: 21.0122, city: "Warszawa", address: null },
  };
}

function publicSites(rows: ReturnType<typeof officialSite>[]) {
  cacheSourceVisibility([1]);
  dbMock.enqueueFor("select", "official.sites", rows);
}

function permitStatements() {
  return dbMock.calls.filter((call) => call.table === "official.permits").map((call) => queryOf(call.clauses.where?.[0]));
}

function unknownCell(operatorId: number, officialSiteIds: number[]) {
  return {
    operatorId,
    match: "none",
    reason: "cellUnknown",
    stationId: null,
    cellId: null,
    isShared: false,
    differences: [],
    nrIdentity: null,
    officialSiteIds,
  };
}

describe("POST /cells/match with include=officialSites", () => {
  it("looks for the eNB id and for the eNB id without its first digit in the third part of the decision number", async () => {
    networks([PLUS]);
    noStoredCells(2);
    dbMock.enqueueFor("select", "official.permits", [
      { siteId: 912, operatorId: 1, fragment: "45678" },
      { siteId: 911, operatorId: 1, fragment: "345678" },
    ]);
    publicSites([officialSite(911, 1), officialSite(912, 1)]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(PLUS, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      results: [unknownCell(1, [911, 912])],
      officialSites: [officialSiteRef(911, 1), officialSiteRef(912, 1)],
    });
    expect(permitStatements()).toEqual([
      {
        sql: `((split_part("official"."permits"."decision_number", '/', 3) in ($1, $2)) and ("official"."sites"."operator_id" in ($3)))`,
        params: ["345678", "45678", 1],
      },
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("searches the sites of a shared network's members, the shorter eNB id first, and lists at most five sites per cell", async () => {
    networks([TMOBILE], [TMOBILE, ORANGE]);
    noStoredCells(2);
    dbMock.enqueueFor("select", "official.permits", [
      { siteId: 930, operatorId: 3, fragment: "345678" },
      { siteId: 925, operatorId: 3, fragment: "45678" },
      { siteId: 921, operatorId: 2, fragment: "345678" },
      { siteId: 924, operatorId: 2, fragment: "45678" },
      { siteId: 923, operatorId: 3, fragment: "45678" },
      { siteId: 922, operatorId: 2, fragment: "45678" },
      { siteId: 924, operatorId: 2, fragment: "345678" },
    ]);
    publicSites([921, 922, 923, 924, 925, 930].map((id) => officialSite(id, id === 923 || id === 925 || id === 930 ? 3 : 2)));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(TMOBILE, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.results).toEqual([unknownCell(2, [922, 924, 921, 923, 925])]);
    expect(response.json().data.officialSites.map((site: { id: number }) => site.id)).toEqual([921, 922, 923, 924, 925]);
    expect(permitStatements().map((statement) => statement.params)).toEqual([["45678", "345678", 2, 3]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps each cell to the sites of its own operator and eNB id, in one statement for the whole request", async () => {
    networks([PLUS, ORANGE, PLAY], [TMOBILE, ORANGE]);
    noStoredCells(7);
    dbMock.enqueueFor("select", "official.permits", [
      { siteId: 941, operatorId: 1, fragment: "45678" },
      { siteId: 942, operatorId: 3, fragment: "45678" },
      { siteId: 943, operatorId: 2, fragment: "5" },
      { siteId: 944, operatorId: 1, fragment: "5" },
      { siteId: 945, operatorId: 3, fragment: "777" },
    ]);
    publicSites([officialSite(941, 1), officialSite(942, 3), officialSite(943, 2)]);
    const app = await createRouteHarness(route);
    const response = await app.inject({
      method: "POST",
      url: URL,
      payload: {
        cells: [
          lte(PLUS, 345678),
          lte(ORANGE, 345678),
          lte(ORANGE, 5),
          lte(PLAY, 777),
          { rat: "gsm", plmn: PLUS.plmn, lac: 1, cid: 2 },
          lte(PLUS, 0),
          lte(ORANGE, 345678, 9),
        ],
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({
      results: [
        unknownCell(1, [941]),
        unknownCell(3, [942]),
        unknownCell(3, [943]),
        unknownCell(6, []),
        unknownCell(1, []),
        { ...unknownCell(1, []), reason: "noIdentifiers" },
        unknownCell(3, [942]),
      ],
      officialSites: [officialSiteRef(941, 1), officialSiteRef(942, 3), officialSiteRef(943, 2)],
    });
    expect(permitStatements().map((statement) => statement.params)).toEqual([["345678", "45678", "5", 1, 3, 2]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves out the sites of a source that is hidden from you", async () => {
    networks([PLUS]);
    noStoredCells(2);
    dbMock.enqueueFor("select", "official.permits", [
      { siteId: 911, operatorId: 1, fragment: "345678" },
      { siteId: 912, operatorId: 1, fragment: "45678" },
    ]);
    publicSites([officialSite(912, 1)]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(PLUS, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({ results: [unknownCell(1, [912])], officialSites: [officialSiteRef(912, 1)] });
    const sites = dbMock.calls.find((call) => call.table === "official.sites");
    const condition = queryOf(sites?.clauses.where?.[0]);
    expect(condition.sql).toContain('"public_location"."source_id" in');
    expect(condition.params).toEqual([911, 912, 1]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([
    ["an operator whose decision numbers do not carry the eNB id", PLAY],
    ["an operator of a country without such a register", ELSEWHERE],
  ])("does not search the register for %s", async (_name, operator) => {
    networks([operator]);
    noStoredCells(2);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(operator, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({ results: [unknownCell(operator.id, [])], officialSites: [] });
    expect(dbMock.calls.filter((call) => call.table?.startsWith("official."))).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not search the register for a cell that was found", async () => {
    networks([PLUS]);
    dbMock.enqueueFor("select", "cells", [
      {
        cell: { id: 10, station_id: 20, band_id: 1 },
        operatorId: 1,
        gsm: null,
        umts: null,
        lte: { enbid: 345678, clid: 1, tac: null, pci: null, earfcn: null },
        nr: null,
      },
    ]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(PLUS, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ results: [{ match: "cell", cellId: 10, officialSiteIds: [] }], officialSites: [] });
    expect(dbMock.calls.filter((call) => call.table?.startsWith("official."))).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("answers without official sites, and logs it, when the register cannot be read", async () => {
    networks([PLUS]);
    noStoredCells(2);
    dbMock.enqueueFor("select", "official.permits", new Error("database unavailable"));
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "POST", url: URL, payload: { cells: [lte(PLUS, 345678)] } });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toEqual({ results: [unknownCell(1, [])], officialSites: [] });
    expect(logger.error).toHaveBeenCalledWith("analyzer.officialSites", expect.anything());
  });
});
