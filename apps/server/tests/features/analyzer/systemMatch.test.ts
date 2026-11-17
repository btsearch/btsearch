import { describe, expect, it } from "vitest";

import { findGnbidLengths, findNrConventions, matchCellsAsSystem } from "../../../src/features/analyzer/match.js";
import { dbMock } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";

function network(code: string, operatorId: number, countryCode: string, countryTools: string[]) {
  dbMock.enqueueFor("select", "plmns", [{ code, operatorId, countryCode, countryTools }]);
  dbMock.enqueueFor("select", "operator_links", []);
  dbMock.enqueueFor("select", "operators", [operatorRow(operatorId, null, countryCode)], []);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(operatorId, code)], []);
  dbMock.enqueueFor("select", "operator_links", []);
}

function lteCellAt(stationId: number, stationStatus = "published") {
  return {
    cell: { id: stationId * 10, station_id: stationId, band_id: 1 },
    operatorId: 1,
    stationStatus,
    gsm: null,
    umts: null,
    lte: { enbid: 100, clid: stationId, tac: null, pci: null, earfcn: null },
    nr: null,
  };
}

function stationPointLookups() {
  return dbMock.calls.filter((call) => call.table === "stations" && call.selection instanceof Object && "latitude" in call.selection);
}

describe("matchCellsAsSystem", () => {
  it("matches a cell in a country with the analyzer off", async () => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [
      { cell: { id: 10, station_id: 20, band_id: 1 }, operatorId: 1, gsm: { lac: 1, cid: 2, bsic: null }, umts: null, lte: null, nr: null },
    ]);

    const [match] = await matchCellsAsSystem([{ rat: "gsm", plmn: "26201", lac: 1, cid: 2 }], []);

    expect(match).toEqual({
      result: expect.objectContaining({
        operatorId: 1,
        match: "cell",
        reason: null,
        stationId: 20,
        stationIds: [20],
        cellId: 10,
        networkMatch: "own",
      }),
      officialSiteIds: [],
    });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([
    { name: "takes the station nearest the point within 10 km", point: { latitude: 52.09, longitude: 21 }, isChosen: true },
    { name: "leaves the stations undecided when the nearest is more than 10 km away", point: { latitude: 51.8, longitude: 21 }, isChosen: false },
  ])("of an eNB on two stations, $name", async ({ point, isChosen }) => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [], [lteCellAt(20), lteCellAt(21)]);
    dbMock.enqueueFor("select", "stations", [
      { id: 20, latitude: 52, longitude: 21 },
      { id: 21, latitude: 52.1, longitude: 21 },
    ]);

    const [match] = await matchCellsAsSystem([{ rat: "lte", plmn: "26201", enbid: 100, clid: 2 }], [point]);

    expect(match?.result).toMatchObject(
      isChosen
        ? { match: "station", reason: null, stationId: 21, stationIds: [20, 21] }
        : { match: "none", reason: "severalStations", stationId: null, stationIds: [20, 21] },
    );
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("does not look up station locations without points", async () => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [], [lteCellAt(20), lteCellAt(21)]);

    const [match] = await matchCellsAsSystem([{ rat: "lte", plmn: "26201", enbid: 100, clid: 2 }], [null]);

    expect(match?.result).toMatchObject({ match: "none", reason: "severalStations", stationIds: [20, 21] });
    expect(stationPointLookups()).toEqual([]);
  });

  it("leaves two stations at the same distance undecided", async () => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [], [lteCellAt(20), lteCellAt(21)]);
    dbMock.enqueueFor("select", "stations", [
      { id: 20, latitude: 52, longitude: 21 },
      { id: 21, latitude: 52, longitude: 21 },
    ]);

    const [match] = await matchCellsAsSystem([{ rat: "lte", plmn: "26201", enbid: 100, clid: 2 }], [{ latitude: 52.01, longitude: 21 }]);

    expect(match?.result).toMatchObject({ match: "none", reason: "severalStations", stationId: null, stationIds: [20, 21] });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("chooses the active station of an eNB that is also on an inactive one", async () => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [], [lteCellAt(20, "inactive"), lteCellAt(21)]);

    const [match] = await matchCellsAsSystem([{ rat: "lte", plmn: "26201", enbid: 100, clid: 2 }], [null]);

    expect(match?.result).toMatchObject({ match: "station", reason: null, stationId: 21, stationIds: [20, 21] });
    expect(stationPointLookups()).toEqual([]);
  });
});

describe("findGnbidLengths", () => {
  it("takes the length of the network's country pack, or of its MCC's when the network is not known", async () => {
    network("26006", 6, "PL", ["analyzer"]);

    const lengths = await findGnbidLengths(["26006", "26001", "23410"]);

    expect(lengths).toEqual(
      new Map([
        ["26006", 28],
        ["26001", 24],
        ["23410", 22],
      ]),
    );
  });
});

describe("findNrConventions", () => {
  it("takes the conventions of the network's country pack, or of its MCC's when the network is not known", async () => {
    network("311480", 7, "US", []);

    expect(await findNrConventions(["311480", "26001"])).toEqual(
      new Map([
        ["311480", { gnbidLength: 22, nodeSpansSites: true }],
        ["26001", { gnbidLength: 24, nodeSpansSites: false }],
      ]),
    );

    dbMock.enqueueFor("select", "plmns", []);

    expect(await findNrConventions(["311480"])).toEqual(new Map([["311480", { gnbidLength: 22, nodeSpansSites: true }]]));
    expect(dbMock.pendingResults()).toBe(0);
  });
});
