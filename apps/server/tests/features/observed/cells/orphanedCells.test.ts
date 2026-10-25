import { describe, expect, it } from "vitest";

import { matchObservedCells } from "../../../../src/features/observed/cells/matching.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { movedCells, scriptMatcherLocks, scriptNetwork, written } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const CELL_KEY = 100 * 65_536 + 2001;

describe("GSM and UMTS cells without a site", () => {
  it("are swept onto a site of their own while they match no cell of ours", async () => {
    const orphaned = { id: 1, plmn: PLUS, rat: "GSM", cellKey: CELL_KEY, observedSiteId: null };
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_cells", [], [{ id: 1 }], [orphaned], []);
    dbMock.enqueueFor("select", "cell_matches", [], []);
    dbMock.enqueueFor("select", "observed_sites", [], [{ id: 30, plmn: PLUS, stationId: null, rat: "GSM", nodeId: CELL_KEY }]);
    dbMock.enqueueFor("insert", "observed_sites", []);
    dbMock.enqueueFor("update", "observed_cells", []);
    dbMock.enqueueFor("select", "site_links", [], []);
    scriptNetwork(PLUS);
    dbMock.enqueueFor("select", "site_estimates", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);
    dbMock.enqueueFor("select", "match_queue", []);
    dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("select", "crowd_settings", []);

    dbMock.enqueueFor("select", "observation_flags", [], []);
    await matchObservedCells();

    expect(written("insert", "observed_sites")).toEqual([[{ plmn: PLUS, stationId: null, rat: "GSM", nodeId: CELL_KEY }]]);
    expect(movedCells()).toEqual([[1, 30]]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 30 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
