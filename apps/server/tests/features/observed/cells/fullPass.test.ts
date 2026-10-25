import { describe, expect, it } from "vitest";

import { matchObservedCells } from "../../../../src/features/observed/cells/matching.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { scriptMatcherLocks, scriptNetwork, writes } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const GNBID = 0x123456;
const NCI = GNBID * 4096 + 5;

describe("the daily pass over every observed cell", () => {
  it("links a site again when its matched cell moved to another station of ours", async () => {
    const storedCell = {
      cell: { id: 10, station_id: 21, band_id: 1 },
      operatorId: 1,
      gsm: null,
      umts: null,
      lte: null,
      nr: { gnbid: GNBID, clid: 5, nci: BigInt(NCI), nrtac: null, pci: null, arfcn: null },
    };
    const sameMatch = { observedCellId: 1, kind: "cell", networkMatch: "own", cellId: 10, stationId: null, matchedAt: new Date() };
    scriptMatcherLocks(2);
    dbMock.enqueueFor("select", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_cells", [], [], [{ id: 1 }], [{ id: 1, plmn: PLUS, rat: "NR", cellKey: NCI, observedSiteId: 5 }], []);
    dbMock.enqueueFor("select", "match_queue", []);
    dbMock.enqueueFor("delete", "match_queue", []);
    dbMock.enqueueFor("select", "observed_cell_values", []);
    scriptNetwork(PLUS);
    dbMock.enqueueFor("select", "cells", [storedCell], [storedCell]);
    dbMock.enqueueFor(
      "select",
      "cell_matches",
      [sameMatch],
      [{ siteId: 5, siteRat: "NR", cellRat: "NR", matchedStationId: null, cellStationId: 21, cellCount: 1 }],
      [],
      [],
    );
    dbMock.enqueueFor(
      "select",
      "site_links",
      [{ observedSiteId: 5, stationId: 20, kind: "matched", linkedById: null }],
      [{ observedSiteId: 5, stationId: 21, kind: "matched", linkedById: null }],
    );
    dbMock.enqueueFor("insert", "site_links", []);
    dbMock.enqueueFor("delete", "curated_cell_summaries", []);
    dbMock.enqueueFor("select", "cells", [], []);
    dbMock.enqueueFor("select", "cell_matches", [], [], []);
    dbMock.enqueueFor("select", "crowd_settings", []);

    dbMock.enqueueFor("select", "observation_flags", [], []);
    await matchObservedCells();

    expect(writes()).toEqual([
      ["delete", "match_queue", undefined],
      ["insert", "site_links", [{ observedSiteId: 5, stationId: 21, kind: "matched" }]],
      ["delete", "curated_cell_summaries", undefined],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
