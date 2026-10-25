import { describe, expect, it } from "vitest";

import { findGnbidLengths, matchCellsAsSystem } from "../../../src/features/analyzer/match.js";
import { dbMock } from "../../helpers/boundaries.js";
import { operatorRow, primaryPlmn } from "../../helpers/operatorFixtures.js";

function network(code: string, operatorId: number, countryCode: string, countryTools: string[]) {
  dbMock.enqueueFor("select", "plmns", [{ code, operatorId, countryCode, countryTools }]);
  dbMock.enqueueFor("select", "operator_links", []);
  dbMock.enqueueFor("select", "operators", [operatorRow(operatorId, null, countryCode)], []);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(operatorId, code)], []);
  dbMock.enqueueFor("select", "operator_links", []);
}

describe("matchCellsAsSystem", () => {
  it("matches a cell in a country with the analyzer off", async () => {
    network("26201", 1, "DE", []);
    dbMock.enqueueFor("select", "cells", [
      { cell: { id: 10, station_id: 20, band_id: 1 }, operatorId: 1, gsm: { lac: 1, cid: 2, bsic: null }, umts: null, lte: null, nr: null },
    ]);

    const [match] = await matchCellsAsSystem([{ rat: "gsm", plmn: "26201", lac: 1, cid: 2 }]);

    expect(match).toEqual({
      result: expect.objectContaining({ operatorId: 1, match: "cell", reason: null, stationId: 20, cellId: 10, networkMatch: "own" }),
      officialSiteIds: [],
    });
    expect(dbMock.pendingResults()).toBe(0);
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
