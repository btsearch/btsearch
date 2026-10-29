import type { CellApplyNewCell } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import type { BandRow } from "../../../../../src/features/bands/serialize.js";
import type { KnownPlmns } from "../../../../../src/features/cells/networkWrites.js";
import {
  type MeasuredCell,
  type SiteCellSource,
  buildSiteCells,
  loadSiteCellInputs,
  suggestStation,
} from "../../../../../src/features/observed/flags/sites/stationSuggestion.js";
import type { DbTx } from "../../../../../src/types/global.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const TWO_PEOPLE = 0b11n;
const PLAY = "26006";
const PLAY_EXTRA = "26098";
const B3: BandRow = { id: 3, value: 1800, rat: "LTE", name: "LTE1800", duplex: "FDD", variant: "commercial", code: "B3" };
const known: KnownPlmns = new Map([
  [PLAY, { id: 6, code: PLAY, countryCode: "PL" }],
  [PLAY_EXTRA, { id: 98, code: PLAY_EXTRA, countryCode: "PL" }],
]);
const SUGGESTED_CELL: CellApplyNewCell = { rat: "lte", bandId: 3, tac: 51010, enbid: 24494, clid: 1, pci: 101, earfcn: 1850, plmns: [PLAY] };
const MEASURED_CELLS: MeasuredCell[] = [{ cell: SUGGESTED_CELL, bearingDeg: null }];
const newCellStation = { ownerCode: PLAY, countryCode: "PL", planBands: [B3] };
const context = { known, gnbidLengths: new Map<string, number>() };

function seen(observedCellId: number, field: "areaCode" | "pci" | "channel", value: number) {
  return { observedCellId, observedSiteId: 7310, field, value, sampleCount: 30, contributorBits: TWO_PEOPLE, lastSeenOn: "2026-10-20" };
}

function siteCell(id: number, overrides: Partial<SiteCellSource> = {}): SiteCellSource {
  return {
    id,
    observedSiteId: 7310,
    plmn: PLAY,
    rat: "LTE",
    cellKey: 24494 * 256 + 1,
    values: [seen(id, "areaCode", 51010), seen(id, "pci", 101), seen(id, "channel", 1850)],
    listedNetworks: [],
    bearingDeg: null,
    ...overrides,
  };
}

describe("the suggested station", () => {
  it("is made from the confirmed cells, copies left out", async () => {
    const cell = { plmn: PLAY, rat: "LTE", cellKey: 24494 * 256 + 1, observedSiteId: 7310 };
    dbMock.enqueueFor("select", "observed_cells", [
      { ...cell, id: 50911, confirmedAt: new Date("2026-10-20T00:00:00Z"), primaryCellId: null },
      { ...cell, id: 50912, confirmedAt: null, primaryCellId: null },
      { ...cell, id: 50913, confirmedAt: new Date("2026-10-20T00:00:00Z"), primaryCellId: 61200 },
    ]);
    dbMock.enqueueFor("select", "observed_cell_values", []);
    dbMock.enqueueFor("select", "cell_networks", []);
    dbMock.enqueueFor("select", "cell_shapes", [{ observedCellId: 50911, bearingDeg: 121.5 }]);
    dbMock.enqueueFor("select", "plmns", []);

    const { cells } = await loadSiteCellInputs(dbMock as unknown as DbTx, [7310]);

    expect(cells.map(({ id, bearingDeg }) => ({ id, bearingDeg }))).toEqual([{ id: 50911, bearingDeg: 121.5 }]);
  });

  it("holds the members' cells with a band of the plan, under the owner's main code alone in a country whose pack switches cell networks off", () => {
    const cells = [
      siteCell(50911, { plmn: PLAY_EXTRA, cellKey: 24494 * 256 + 2, bearingDeg: 121.5 }),
      siteCell(50914, { values: [seen(50914, "channel", 6300)] }),
      siteCell(50915, { observedSiteId: 7311, cellKey: 24495 * 256 + 11 }),
    ];

    expect(buildSiteCells(cells, [7310, 7311], newCellStation, context)).toEqual([
      { cell: { rat: "lte", bandId: 3, tac: 51010, enbid: 24494, clid: 2, pci: 101, earfcn: 1850, plmns: [PLAY] }, bearingDeg: 121.5 },
      { cell: { rat: "lte", bandId: 3, tac: 51010, enbid: 24495, clid: 11, pci: 101, earfcn: 1850, plmns: [PLAY] }, bearingDeg: null },
    ]);
  });

  it("hangs each cell on a sector at its measured bearing to the degree, and a cell without one on none", () => {
    const cellAt = (clid: number, bearingDeg: number | null): MeasuredCell => ({ cell: { ...SUGGESTED_CELL, clid }, bearingDeg });
    const suggestion = suggestStation(siteRecord(), [cellAt(1, 120.4), cellAt(11, 119.6), cellAt(2, 240.5), cellAt(3, 359.7), cellAt(4, null)], null);

    expect(suggestion?.sectors).toEqual([
      { key: "azimuth-0", azimuth: 0 },
      { key: "azimuth-120", azimuth: 120 },
      { key: "azimuth-241", azimuth: 241 },
    ]);
    expect(suggestion?.cells?.map((cell) => [cell.rat === "lte" ? cell.clid : null, cell.sectorKey])).toEqual([
      [1, "azimuth-120"],
      [11, "azimuth-120"],
      [2, "azimuth-241"],
      [3, "azimuth-0"],
      [4, undefined],
    ]);
  });

  it("keeps the 15 bearings that hold the most cells, so the station stays within its sector limit", () => {
    const cells = Array.from({ length: 17 }, (_, index): MeasuredCell => ({ cell: { ...SUGGESTED_CELL, clid: index }, bearingDeg: index * 20 }));
    const suggestion = suggestStation(siteRecord(), [...cells, { cell: { ...SUGGESTED_CELL, clid: 40 }, bearingDeg: 320 }], null);

    expect(suggestion?.sectors).toHaveLength(15);
    expect(suggestion?.sectors?.map((sector) => sector.azimuth)).toContain(320);
    expect(suggestion?.cells?.filter((cell) => cell.sectorKey === undefined)).toHaveLength(2);
  });

  it("is not made for a network without an operator, nor without cells or a number", () => {
    expect(suggestStation(siteRecord({ operatorId: null }), MEASURED_CELLS, null)).toBeNull();
    expect(suggestStation(siteRecord(), [], null)).toBeNull();
  });
});
