import { describe, expect, it } from "vitest";

import { matchObservedCells } from "../../../../src/features/observed/cells/matching.js";
import { logger } from "../../../../src/utils/logger.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { scriptMatcherLocks, scriptNetwork, written } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const GNBID = 0x123456;
const NCI = GNBID * 4096 + 5;

describe("matchObservedCells", () => {
  it("matches a queued cell, links its site to the station, summarises our cell and runs the flag pass over both", async () => {
    const storedCell = {
      cell: { id: 10, station_id: 20, band_id: 1 },
      operatorId: 1,
      gsm: null,
      umts: null,
      lte: null,
      nr: { gnbid: GNBID, clid: 5, nci: BigInt(NCI), nrtac: null, pci: null, arfcn: null },
    };
    scriptMatcherLocks(2);
    dbMock.enqueueFor("select", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_cells", [], [], [{ id: 1, plmn: PLUS, rat: "NR", cellKey: NCI, observedSiteId: 5 }], [], [], []);
    dbMock.enqueueFor("select", "match_queue", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "match_queue", []);
    scriptNetwork(PLUS);
    dbMock.enqueueFor("select", "cells", [storedCell], [storedCell]);
    dbMock.enqueueFor(
      "select",
      "cell_matches",
      [],
      [{ siteId: 5, siteRat: "NR", cellRat: "NR", matchedStationId: null, cellStationId: 20, cellCount: 1 }],
      [{ cellId: 10, firstSeenOn: "2026-10-20", lastSeenOn: "2026-10-24", observedCellCount: 1 }],
      [],
      [],
    );
    dbMock.enqueueFor("insert", "cell_matches", []);
    dbMock.enqueueFor("select", "site_links", [], [{ observedSiteId: 5, stationId: 20, kind: "matched", linkedById: null }]);
    dbMock.enqueueFor("insert", "site_links", []);
    dbMock.enqueueFor("delete", "curated_cell_summaries", []);
    dbMock.enqueueFor("insert", "curated_cell_summaries", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);
    dbMock.enqueueFor("select", undefined, []);
    dbMock.enqueueFor("select", "cells", [], []);
    dbMock.enqueueFor("select", "cell_matches", [], [], []);
    dbMock.enqueueFor("select", "crowd_settings", []);

    dbMock.enqueueFor("select", "observation_flags", [], []);
    await matchObservedCells();

    expect(written("insert", "cell_matches")).toEqual([[{ observedCellId: 1, kind: "cell", networkMatch: "own", cellId: 10, stationId: null }]]);
    expect(written("insert", "site_links")).toEqual([[{ observedSiteId: 5, stationId: 20, kind: "matched" }]]);
    expect(written("insert", "curated_cell_summaries")).toEqual([
      [{ cellId: 10, firstSeenOn: "2026-10-20", lastSeenOn: "2026-10-24", observedCellCount: 1, bandwidthKhz: null }],
    ]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 5 }]]);
    expect(logger.info).toHaveBeenCalledWith("observations.flags.cell_pass_finished", expect.objectContaining({ cells: 1, sites: 1 }));
    expect(dbMock.pendingResults()).toBe(0);
  });
});
