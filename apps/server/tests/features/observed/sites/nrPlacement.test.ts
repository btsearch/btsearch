import { describe, expect, it } from "vitest";

import { giveNrCellsSites, recutNrSites } from "../../../../src/features/observed/sites/nrPlacement.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { movedCells, scriptMatcherLocks, scriptNetwork, written } from "../../../helpers/observedFixtures.js";

const PLUS = "26001";
const PLAY = "26006";
const GNBID_24 = 0x123456;
const FIRST_GNBID_28 = 0x1234567;
const SECOND_GNBID_28 = 0x1234568;
const EDITOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type CarriedOver = { ignores?: unknown[]; links?: unknown[]; flags?: unknown[] };

function playNrCell(id: number, gnbid: number, clid: number) {
  return { id, plmn: PLAY, rat: "NR", cellKey: gnbid * 256 + clid, observedSiteId: 7 };
}

function scriptPlayRecut(lockedCells: unknown[], { ignores = [], links = [], flags = [] }: CarriedOver = {}): void {
  dbMock.enqueueFor("select", "observed_sites", [{ plmn: PLAY }]);
  scriptNetwork(PLAY, { operatorId: 6 });
  scriptMatcherLocks();
  dbMock.enqueueFor("select", "observed_cells", lockedCells);
  dbMock.enqueueFor("update", "observed_sites", []);
  dbMock.enqueueFor("insert", "observed_sites", []);
  dbMock.enqueueFor("select", "observed_sites", [
    { id: 11, nodeId: FIRST_GNBID_28 },
    { id: 12, nodeId: SECOND_GNBID_28 },
  ]);
  dbMock.enqueueFor("update", "observed_cells", []);
  dbMock.enqueueFor("insert", "site_replacements", []);
  dbMock.enqueueFor("select", "site_ignores", ignores);
  dbMock.enqueueFor("select", "site_links", links);
  dbMock.enqueueFor("select", "observation_flags", flags);
}

describe("NR sites", () => {
  it("gives a new NR cell the site of its gNB id", async () => {
    dbMock.enqueueFor(
      "select",
      "observed_cells",
      [{ plmn: PLUS }],
      [{ id: 3, plmn: PLUS, rat: "NR", cellKey: GNBID_24 * 4096 + 5, observedSiteId: null }],
    );
    scriptNetwork(PLUS);
    scriptMatcherLocks();
    dbMock.enqueueFor("insert", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_sites", [{ id: 21, nodeId: GNBID_24 }]);
    dbMock.enqueueFor("update", "observed_cells", []);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    await giveNrCellsSites();

    expect(written("insert", "observed_sites")).toEqual([[{ plmn: PLUS, rat: "NR", nodeId: GNBID_24 }]]);
    expect(movedCells()).toEqual([[3, 21]]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 21 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("moves Play's cells to the sites of their 28-bit gNB ids, and the retired 24-bit site leads to them", async () => {
    scriptPlayRecut([playNrCell(1, FIRST_GNBID_28, 1), playNrCell(2, SECOND_GNBID_28, 2)]);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    await recutNrSites();

    expect(written("update", "observed_sites")).toEqual([{ retiredAt: expect.anything() }]);
    expect(written("insert", "observed_sites")).toEqual([
      [
        { plmn: PLAY, rat: "NR", nodeId: FIRST_GNBID_28 },
        { plmn: PLAY, rat: "NR", nodeId: SECOND_GNBID_28 },
      ],
    ]);
    expect(movedCells()).toEqual([
      [1, 11],
      [2, 12],
    ]);
    expect(written("insert", "site_replacements")).toEqual([
      [
        { observedSiteId: 7, replacedBySiteId: 11 },
        { observedSiteId: 7, replacedBySiteId: 12 },
      ],
    ]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 7 }, { observedSiteId: 11 }, { observedSiteId: 12 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("passes the retired site's ignore to each new site, but not to one that has a link an editor made", async () => {
    const ignore = {
      observedSiteId: 7,
      ignoredById: EDITOR_ID,
      reason: "Femtocell inside a shopping centre",
      ignoredAt: new Date("2026-10-20T10:00:00Z"),
      observedCellIds: [1, 2],
      point: { x: 19.93, y: 50.06 },
      uncertaintyM: 60,
    };
    const handLink = { observedSiteId: 12, stationId: 20, kind: "matched", linkedById: EDITOR_ID, linkedAt: new Date("2026-10-21T10:00:00Z") };
    scriptPlayRecut([playNrCell(1, FIRST_GNBID_28, 1), playNrCell(2, SECOND_GNBID_28, 2)], { ignores: [ignore], links: [handLink] });
    dbMock.enqueueFor("insert", "site_ignores", []);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    await recutNrSites();

    expect(written("insert", "site_ignores")).toEqual([[{ ...ignore, observedSiteId: 11 }]]);
    expect(written("insert", "site_links")).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("passes the retired site's dismissed flag to each new site that holds none of its kind, under the new site's key", async () => {
    const raisedAt = new Date("2026-10-18T10:00:00Z");
    const dismissal = {
      id: 3301,
      kind: "unmatchedSite",
      subjectKey: `observedSite:${PLAY}:NR:${GNBID_24}`,
      observedSiteId: 7,
      countryCode: "PL",
      regionId: 14,
      evidence: { people: 3 },
      measure: { people: 3, latitude: 50.06, longitude: 19.93, radiusMeters: 400 },
      suggestion: null,
      createdAt: raisedAt,
      updatedAt: raisedAt,
      closedReason: "dismissed",
      dismissedReason: "notAnIssue",
      resolvedAt: raisedAt,
      resolvedById: EDITOR_ID,
      note: "Indoor system of a shopping centre",
    };
    scriptPlayRecut([playNrCell(1, FIRST_GNBID_28, 1), playNrCell(2, SECOND_GNBID_28, 2)], { flags: [dismissal] });
    dbMock.enqueueFor("select", "observed_sites", [
      { id: 11, plmn: PLAY, rat: "NR", nodeId: FIRST_GNBID_28, stationId: null },
      { id: 12, plmn: PLAY, rat: "NR", nodeId: SECOND_GNBID_28, stationId: null },
    ]);
    dbMock.enqueueFor("select", "observation_flags", [{ kind: "unmatchedSite", subjectKey: `observedSite:${PLAY}:NR:${SECOND_GNBID_28}` }]);
    dbMock.enqueueFor("insert", "observation_flags", []);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    await recutNrSites();

    const { id: _id, updatedAt: _updatedAt, ...carried } = dismissal;
    expect(written("insert", "observation_flags")).toEqual([
      [{ ...carried, subjectKey: `observedSite:${PLAY}:NR:${FIRST_GNBID_28}`, observedSiteId: 11 }],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("takes a GSM cell of a recut site to the new site of its station's NR cell, and links that site to the station", async () => {
    const gsmCell = { id: 3, plmn: PLAY, rat: "GSM", cellKey: 100 * 65_536 + 2001, observedSiteId: 7 };
    scriptPlayRecut([playNrCell(1, FIRST_GNBID_28, 1), playNrCell(2, SECOND_GNBID_28, 2), gsmCell]);
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 3, stationId: 20 }], []);
    dbMock.enqueueFor("select", "cells", [{ id: 11, plmn: PLAY, rat: "NR", stationId: 20, matchedCellCount: 1 }]);
    dbMock.enqueueFor("update", "observed_cells", []);
    dbMock.enqueueFor("update", "observed_sites", [{ id: 7 }]);
    dbMock.enqueueFor("insert", "site_replacements", []);
    dbMock.enqueueFor("select", "site_ignores", []);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("select", "observation_flags", []);
    dbMock.enqueueFor("select", "cell_matches", [
      { siteId: 11, siteRat: "NR", cellRat: "NR", matchedStationId: null, cellStationId: 20, cellCount: 1 },
      { siteId: 11, siteRat: "NR", cellRat: "GSM", matchedStationId: null, cellStationId: 20, cellCount: 1 },
    ]);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    await recutNrSites();

    expect(movedCells()).toEqual([
      [1, 11],
      [2, 12],
      [3, 11],
    ]);
    expect(written("insert", "site_replacements").flat()).toContainEqual({ observedSiteId: 7, replacedBySiteId: 11 });
    expect(written("insert", "site_links")).toEqual([[{ observedSiteId: 11, stationId: 20, kind: "matched" }]]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 7 }, { observedSiteId: 11 }, { observedSiteId: 12 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
