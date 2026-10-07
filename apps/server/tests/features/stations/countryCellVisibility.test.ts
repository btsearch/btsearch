import type { CountryFeatures } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { serializeCells } from "../../../src/features/cells/read.js";
import { flattenCell } from "../../../src/features/stations/history.js";
import { type CellRows, toCell } from "../../../src/features/stations/serialize.js";
import getLegacyCells from "../../../src/routes/v1/(get)/cells/index.js";
import { dbMock } from "../../helpers/boundaries.js";
import { readDate, readStation } from "../../helpers/readFixtures.js";
import { createRouteHarness } from "../../helpers/routeHarness.js";

const featureCases = [
  { structureOwnerProposals: true, psc: false, bsic: false },
  { structureOwnerProposals: true, psc: true, bsic: false },
  { structureOwnerProposals: true, psc: false, bsic: true },
  { structureOwnerProposals: true, psc: true, bsic: true },
] as const satisfies readonly CountryFeatures[];

function cellRows(rat: "GSM" | "UMTS", stationId = 1): CellRows {
  const timestamps = { createdAt: readDate, updatedAt: readDate };
  return {
    cell: {
      id: stationId,
      station_id: stationId,
      band_id: 1,
      sector_id: null,
      rat,
      type: "MACROCELL",
      notes: null,
      is_confirmed: true,
      ...timestamps,
    },
    gsm: rat === "GSM" ? { cell_id: stationId, lac: 1, cid: 2, e_gsm: false, bsic: 0, ...timestamps } : null,
    umts: rat === "UMTS" ? { cell_id: stationId, lac: 1, rnc: 3, cid: 2, cid_long: 196610, arfcn: null, psc: 0, ...timestamps } : null,
    lte: null,
    nr: null,
  };
}

describe("toCell", () => {
  it.each(featureCases)("applies independent country flags with PSC=$psc and BSIC=$bsic", (features) => {
    const gsm = cellRows("GSM");
    const umts = cellRows("UMTS");

    expect(toCell(gsm, undefined, false, features)).toMatchObject({ rat: "gsm", lac: 1, cid: 2, bsic: features.bsic ? 0 : null });
    expect(toCell(umts, undefined, false, features)).toMatchObject({ rat: "umts", lac: 1, rnc: 3, cid: 2, psc: features.psc ? 0 : null });
    expect(gsm.gsm?.bsic).toBe(0);
    expect(umts.umts?.psc).toBe(0);
  });

  it("returns existing codes again after a country re-enables them", () => {
    const rows = cellRows("GSM");
    expect(toCell(rows, undefined, false, featureCases[0])).toMatchObject({ bsic: null });
    expect(toCell(rows, undefined, false, featureCases[3])).toMatchObject({ bsic: 0 });
  });

  it("omits a cell without its RAT details", () => {
    expect(toCell({ ...cellRows("GSM"), gsm: null }, undefined, false, featureCases[3])).toBeNull();
  });
});

describe("flattenCell", () => {
  it.each(featureCases)("applies independent history flags with PSC=$psc and BSIC=$bsic", (features) => {
    const values = { rat: "GSM", details: { lac: 1, bsic: 0, psc: 0 } };
    const expected: Record<string, unknown> = { rat: "GSM", lac: 1 };
    if (features.bsic) expected.bsic = 0;
    if (features.psc) expected.psc = 0;

    expect(flattenCell(values, features)).toEqual(expected);
    expect(values.details).toEqual({ lac: 1, bsic: 0, psc: 0 });
  });

  it.each([null, undefined, [], 0, "cell"])("ignores invalid snapshots: %s", (value) => {
    expect(flattenCell(value, featureCases[3])).toBeNull();
  });
});

describe("serializeCells", () => {
  it("uses each station's country flags without requiring embedded station data", async () => {
    const gsm = cellRows("GSM", 1);
    const umts = cellRows("UMTS", 2);
    dbMock.enqueueFor("select", "bands", []);
    dbMock.enqueueCountryFeatures("stations", [
      { stationId: 1, structureOwnerProposals: true, psc: true, bsic: false },
      { stationId: 2, structureOwnerProposals: true, psc: true, bsic: false },
    ]);

    const listed = await serializeCells([
      { ...gsm, station: { ...readStation, extra_address: null, id: 1, status: "published" } },
      { ...umts, station: { ...readStation, extra_address: null, id: 2, status: "published" } },
    ]);

    expect(listed).toMatchObject([
      { rat: "gsm", bsic: null },
      { rat: "umts", psc: 0 },
    ]);
    expect(listed.every((cell) => cell.station === undefined)).toBe(true);
    expect(dbMock.calls.filter((call) => call.table === "stations")).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns an empty page without loading country features", async () => {
    expect(await serializeCells([])).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/cells", () => {
  it.each(featureCases)("masks raw legacy details with PSC=$psc and BSIC=$bsic", async (features) => {
    const band = { id: 1, rat: "GSM", code: "GSM900", name: "900", value: 900, duplex: "FDD", variant: "commercial" };
    const gsm = cellRows("GSM", 1);
    const umts = cellRows("UMTS", 2);
    dbMock.query.cells.findMany.mockResolvedValue([
      { ...gsm.cell, gsm: gsm.gsm, umts: null, lte: null, nr: null, band, station: { ...readStation, extra_address: null } },
      { ...umts.cell, gsm: null, umts: umts.umts, lte: null, nr: null, band, station: { ...readStation, extra_address: null, id: 2 } },
    ]);
    dbMock.enqueueCountryFeatures("stations", [
      { stationId: 1, ...features },
      { stationId: 2, ...features },
    ]);
    const app = await createRouteHarness(getLegacyCells);

    const response = await app.inject({ method: "GET", url: "/cells" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([
      { rat: "GSM", details: { lac: 1, cid: 2, bsic: features.bsic ? 0 : null } },
      { rat: "UMTS", details: { lac: 1, rnc: 3, cid: 2, psc: features.psc ? 0 : null } },
    ]);
    expect(gsm.gsm?.bsic).toBe(0);
    expect(umts.umts?.psc).toBe(0);
    expect(dbMock.calls.filter((call) => call.table === "stations")).toHaveLength(1);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
