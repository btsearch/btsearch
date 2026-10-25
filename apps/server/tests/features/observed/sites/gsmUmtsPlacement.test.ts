import { describe, expect, it } from "vitest";

import { type LteNrSite, chooseSite, placeGsmUmtsCells } from "../../../../src/features/observed/sites/gsmUmtsPlacement.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { movedCells, written } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const GSM_CELL = { plmn: PLUS, rat: "GSM" as const, cellKey: 100 * 65_536 + 2001 };

describe("the site of a GSM or UMTS cell", () => {
  it("is its station's LTE site rather than an NR site with more matched cells", () => {
    const sites: LteNrSite[] = [
      { id: 4, rat: "NR", matchedCellCount: 5 },
      { id: 9, rat: "LTE", matchedCellCount: 1 },
    ];
    expect(chooseSite(GSM_CELL, 20, sites)).toEqual({ siteId: 9 });
  });

  it("is the station's site with the most matched cells, and the lowest id among equals", () => {
    const sites: LteNrSite[] = [
      { id: 3, rat: "LTE", matchedCellCount: 1 },
      { id: 8, rat: "LTE", matchedCellCount: 2 },
      { id: 6, rat: "LTE", matchedCellCount: 2 },
    ];
    expect(chooseSite(GSM_CELL, 20, sites)).toEqual({ siteId: 6 });
  });

  it("is the station's own site on the network when the station has no LTE or NR site there", () => {
    expect(chooseSite(GSM_CELL, 20, [])).toEqual({ identity: { plmn: PLUS, stationId: 20, rat: null, nodeId: null } });
  });

  it("is a site of the cell alone while it matches no cell of ours", () => {
    const umtsCell = { ...GSM_CELL, rat: "UMTS" as const };
    expect(chooseSite(umtsCell, undefined, [])).toEqual({ identity: { plmn: PLUS, stationId: null, rat: "UMTS", nodeId: umtsCell.cellKey } });
  });

  it("moves from the cell's own site to its station's site once the cell matches, and the emptied site leads there", async () => {
    const cell = { id: 1, ...GSM_CELL, observedSiteId: 7 };
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 1, stationId: 20 }], []);
    dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("select", "observed_sites", [], [{ id: 50, plmn: PLUS, stationId: 20, rat: null, nodeId: null }]);
    dbMock.enqueueFor("insert", "observed_sites", []);
    dbMock.enqueueFor("update", "observed_cells", []);
    dbMock.enqueueFor("update", "observed_sites", [{ id: 7 }]);
    dbMock.enqueueFor("insert", "site_replacements", []);
    dbMock.enqueueFor("select", "site_ignores", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("select", "observation_flags", []);

    const placed = await placeGsmUmtsCells(dbMock as unknown as DbTx, [cell]);

    expect(written("insert", "observed_sites")).toEqual([[{ plmn: PLUS, stationId: 20, rat: null, nodeId: null }]]);
    expect(movedCells()).toEqual([[1, 50]]);
    expect(written("insert", "site_replacements")).toEqual([[{ observedSiteId: 7, replacedBySiteId: 50 }]]);
    expect(placed).toEqual({ changedSiteIds: [7, 50], placedCells: [{ ...cell, observedSiteId: 50 }] });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("moves to its station's new LTE site, and the station's site it leaves keeps its id while other cells remain on it", async () => {
    const cell = { id: 1, ...GSM_CELL, observedSiteId: 40 };
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 1, stationId: 20 }], []);
    dbMock.enqueueFor("select", "cells", [{ id: 9, plmn: PLUS, rat: "LTE", stationId: 20, matchedCellCount: 3 }]);
    dbMock.enqueueFor("update", "observed_cells", []);
    dbMock.enqueueFor("update", "observed_sites", []);

    const placed = await placeGsmUmtsCells(dbMock as unknown as DbTx, [cell]);

    expect(movedCells()).toEqual([[1, 9]]);
    expect(written("insert", "site_replacements")).toEqual([]);
    expect(placed.changedSiteIds).toEqual([40, 9]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
