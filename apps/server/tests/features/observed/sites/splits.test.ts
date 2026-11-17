import { describe, expect, it } from "vitest";

import { applySiteSplits } from "../../../../src/features/observed/sites/splits/engine.js";
import { placeCellsOfSplitNodes, releaseLteCellsOfRetiredSites } from "../../../../src/features/observed/sites/splits/placement.js";
import { splitSitesByStations } from "../../../../src/features/observed/sites/splits/stations.js";
import { type Point, SQUARE_ZOOM, quadkeyOf, tileAt } from "../../../../src/features/observed/tiles/squares.js";
import type { DbTx } from "../../../../src/types/global.js";
import { logger } from "../../../../src/utils/logger.js";
import { dbMock, queryOf } from "../../../helpers/boundaries.js";
import { movedCells, scriptMatcherLocks, scriptNetwork, writes, written } from "../../../helpers/observedFixtures.js";

const PLAY = "26006";
const PLUS = "26001";
const VERIZON = "311480";
const ENBID = 24494;
const HUB_GNBID_22 = 1_437_974;
const SITE_ID = 812;
const HOST = { latitude: 50.06, longitude: 19.93 };
const ACROSS_THE_STREET = { latitude: 50.0627, longitude: 19.93 };
const REMOTE = { latitude: 50.06, longitude: 20.014 };
const FAR = { latitude: 50.2, longitude: 19.93 };
const NODE_SITE = { id: SITE_ID, plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 0 };
const COPY_SITE = { id: 822, plmn: PLUS, rat: "LTE", nodeId: ENBID, place: 0 };

function lteCell(id: number, clid: number, observedSiteId: number | null = SITE_ID, rat = "LTE") {
  return { id, plmn: PLAY, rat, cellKey: ENBID * 256 + clid, observedSiteId };
}

function copyCell(id: number, clid: number) {
  return { id, plmn: PLUS, rat: "LTE", cellKey: ENBID * 256 + clid, observedSiteId: COPY_SITE.id };
}

function row(observedCellId: number, part: number) {
  return { observedCellId, part };
}

function atStation(observedCellId: number, stationId: number, { latitude, longitude }: Point, site: object = NODE_SITE) {
  return { site, observedCellId, stationId, latitude, longitude };
}

function binsAround(observedCellId: number, point: Point) {
  return { observedSiteId: SITE_ID, observedCellId, bin: quadkeyOf(tileAt(point, SQUARE_ZOOM)), weight: 1000n };
}

function estimateAt(observedSiteId: number, { latitude, longitude }: Point) {
  return { observedSiteId, point: { x: longitude, y: latitude }, isConsistent: true };
}

function copiesAmongAsked(copies: { observedCellId: number; primaryCellId: number }[]) {
  return () => {
    const asked = new Set(queryOf(dbMock.calls.at(-1)?.clauses.where?.[0]).params);
    return copies.filter((copy) => asked.has(copy.observedCellId));
  };
}

function placeSite(id: number, place: number) {
  return { id, plmn: PLAY, rat: "LTE", nodeId: ENBID, place };
}

function handLinkTo(stationId: number) {
  return { observedSiteId: SITE_ID, stationId, kind: "matched", linkedById: "editor", linkedAt: new Date("2026-11-01T10:00:00Z") };
}

function scriptProposal(onSite: unknown[], proposal: unknown[], atStations: unknown[] = []): void {
  dbMock.enqueueFor("delete", "site_splits", []);
  dbMock.enqueueFor("select", "site_splits", [NODE_SITE]);
  scriptMatcherLocks();
  dbMock.enqueueFor("select", "observed_cells", onSite);
  dbMock.enqueueFor("delete", "site_splits", proposal);
  dbMock.enqueueFor("select", "cell_matches", atStations);
}

function scriptSplit(lastPlace: number, parts: unknown[], copiesOfMoved: unknown[] = [], handLinks: unknown[] = []): void {
  dbMock.enqueueFor("select", "observed_sites", [{ plmn: PLAY, rat: "LTE", nodeId: ENBID, place: lastPlace }]);
  dbMock.enqueueFor("insert", "observed_sites", parts);
  dbMock.enqueueFor("update", "observed_cells", []);
  dbMock.enqueueFor("update", "observed_sites", []);
  dbMock.enqueueFor("insert", "site_replacements", []);
  dbMock.enqueueFor("select", "site_ignores", []);
  dbMock.enqueueFor("select", "site_links", handLinks);
  dbMock.enqueueFor("select", "observation_flags", []);
  dbMock.enqueueFor("select", "cell_copies", copiesOfMoved);
}

function scriptLinkingAndDirtying(): void {
  dbMock.enqueueFor("select", "cell_matches", []);
  dbMock.enqueueFor("select", "site_links", []);
  dbMock.enqueueFor("insert", "dirty_sites", []);
}

describe("the engine's split of a site", () => {
  it("puts each part on a new site of the same eNB with the next places, retires the site and points it at every part", async () => {
    const onSite = [lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17), lteCell(9018, 18)];
    scriptProposal(onSite, [row(9001, 0), row(9002, 0), row(9017, 1), row(9018, 1), row(9301, 1)]);
    scriptSplit(0, [placeSite(901, 1), placeSite(902, 2)]);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(written("insert", "observed_sites")).toEqual([
      [
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 1 },
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 2 },
      ],
    ]);
    expect(movedCells()).toEqual([
      [9001, 901],
      [9002, 901],
      [9017, 902],
      [9018, 902],
    ]);
    expect(written("update", "observed_sites")).toEqual([{ retiredAt: expect.anything() }]);
    expect(written("insert", "site_replacements")).toEqual([
      [
        { observedSiteId: SITE_ID, replacedBySiteId: 901 },
        { observedSiteId: SITE_ID, replacedBySiteId: 902 },
      ],
    ]);
    expect(written("delete", "site_splits")).toHaveLength(2);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: SITE_ID }, { observedSiteId: 901 }, { observedSiteId: 902 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("is dropped when one part is left once the cells that moved away are set aside", async () => {
    dbMock.enqueueFor("delete", "site_splits", []);
    dbMock.enqueueFor("select", "site_splits", [NODE_SITE]);
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_cells", [lteCell(9001, 1), lteCell(9002, 2)]);
    dbMock.enqueueFor("delete", "site_splits", [row(9001, 0), row(9002, 0), row(9017, 1)]);

    await applySiteSplits();

    expect(writes()).toEqual([
      ["delete", "site_splits", undefined],
      ["delete", "site_splits", undefined],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("is dropped when a cell arrived on the site after the estimate", async () => {
    dbMock.enqueueFor("delete", "site_splits", []);
    dbMock.enqueueFor("select", "site_splits", [NODE_SITE]);
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_cells", [lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17), lteCell(9030, 30)]);
    dbMock.enqueueFor("delete", "site_splits", [row(9001, 0), row(9002, 0), row(9017, 1)]);
    dbMock.enqueueFor("select", "cell_copies", []);

    await applySiteSplits();

    expect(writes()).toEqual([
      ["delete", "site_splits", undefined],
      ["delete", "site_splits", undefined],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("takes a copy of another network's cell, which the estimate leaves out, to the part nearest its primary's readings", async () => {
    const onSite = [lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17), lteCell(9030, 30)];
    const copyOfRemoteCell = { observedCellId: 9030, primaryCellId: 7030 };
    scriptProposal(onSite, [row(9001, 0), row(9002, 0), row(9017, 1)]);
    dbMock.enqueueFor("select", "cell_copies", [copyOfRemoteCell], [copyOfRemoteCell]);
    dbMock.enqueueFor("select", "cell_bins", [binsAround(9001, HOST), binsAround(9017, REMOTE), binsAround(7030, REMOTE)]);
    scriptSplit(0, [placeSite(901, 1), placeSite(902, 2)]);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(movedCells()).toEqual([
      [9001, 901],
      [9002, 901],
      [9017, 902],
      [9030, 902],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("is dropped when two of its parts hold cells of stations of ours in one place", async () => {
    const onSite = [lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17)];
    scriptProposal(onSite, [row(9001, 0), row(9002, 0), row(9017, 1)], [atStation(9001, 20, HOST), atStation(9017, 22, ACROSS_THE_STREET)]);

    await applySiteSplits();

    expect(writes()).toEqual([
      ["delete", "site_splits", undefined],
      ["delete", "site_splits", undefined],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("splits the other network's site that holds copies of the cells along the same parts", async () => {
    scriptProposal([lteCell(9001, 1), lteCell(9017, 17)], [row(9001, 0), row(9017, 1)]);
    scriptSplit(
      0,
      [placeSite(901, 1), placeSite(902, 2)],
      [
        { site: COPY_SITE, observedCellId: 9501, primaryCellId: 9001 },
        { site: COPY_SITE, observedCellId: 9517, primaryCellId: 9017 },
      ],
    );
    scriptLinkingAndDirtying();
    dbMock.enqueueFor("select", "observed_cells", [copyCell(9501, 1), copyCell(9517, 17)]);
    scriptSplit(0, [
      { ...COPY_SITE, id: 921, place: 1 },
      { ...COPY_SITE, id: 922, place: 2 },
    ]);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(written("insert", "observed_sites")).toEqual([
      [
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 1 },
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 2 },
      ],
      [
        { plmn: PLUS, rat: "LTE", nodeId: ENBID, place: 1 },
        { plmn: PLUS, rat: "LTE", nodeId: ENBID, place: 2 },
      ],
    ]);
    expect(movedCells()).toEqual([
      [9001, 901],
      [9017, 902],
      [9501, 921],
      [9517, 922],
    ]);
    expect(written("insert", "site_replacements")).toEqual([
      [
        { observedSiteId: SITE_ID, replacedBySiteId: 901 },
        { observedSiteId: SITE_ID, replacedBySiteId: 902 },
      ],
      [
        { observedSiteId: COPY_SITE.id, replacedBySiteId: 921 },
        { observedSiteId: COPY_SITE.id, replacedBySiteId: 922 },
      ],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("takes a cell of the copy site that copies nothing to the part of its readings, even the smaller one", async () => {
    scriptProposal([lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17)], [row(9001, 0), row(9002, 0), row(9017, 1)]);
    scriptSplit(
      0,
      [placeSite(901, 1), placeSite(902, 2)],
      [
        { site: COPY_SITE, observedCellId: 9501, primaryCellId: 9001 },
        { site: COPY_SITE, observedCellId: 9502, primaryCellId: 9002 },
        { site: COPY_SITE, observedCellId: 9517, primaryCellId: 9017 },
      ],
    );
    scriptLinkingAndDirtying();
    dbMock.enqueueFor("select", "observed_cells", [copyCell(9501, 1), copyCell(9502, 2), copyCell(9517, 17), copyCell(9599, 99)]);
    dbMock.enqueueReadFor(
      "select",
      "cell_copies",
      copiesAmongAsked([
        { observedCellId: 9501, primaryCellId: 9001 },
        { observedCellId: 9502, primaryCellId: 9002 },
        { observedCellId: 9517, primaryCellId: 9017 },
      ]),
    );
    dbMock.enqueueFor("select", "cell_bins", [binsAround(9001, HOST), binsAround(9002, HOST), binsAround(9017, REMOTE), binsAround(9599, REMOTE)]);
    scriptSplit(0, [
      { ...COPY_SITE, id: 921, place: 1 },
      { ...COPY_SITE, id: 922, place: 2 },
    ]);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(movedCells().slice(3)).toEqual([
      [9501, 921],
      [9502, 921],
      [9517, 922],
      [9599, 922],
    ]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("gives the site's hand link only to the part with cells of the linked station", async () => {
    const handLink = handLinkTo(21);
    scriptProposal([lteCell(9001, 1), lteCell(9017, 17)], [row(9001, 0), row(9017, 1)], [atStation(9017, 21, REMOTE)]);
    scriptSplit(0, [placeSite(901, 1), placeSite(902, 2)], [], [handLink]);
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 9017, matchedStationId: null, cellStationId: 21 }]);
    dbMock.enqueueFor("insert", "site_links", []);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(written("insert", "site_links")).toEqual([[{ ...handLink, observedSiteId: 902 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it.each([
    [
      "the part whose readings lie nearest the linked station, while no part holds its cells",
      [binsAround(9001, HOST), binsAround(9017, REMOTE)],
      902,
    ],
    ["the largest part, while no part's readings tell", [], 901],
  ])("gives the site's hand link to %s", async (_title, bins, heir) => {
    const handLink = handLinkTo(30);
    scriptProposal([lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17)], [row(9001, 0), row(9002, 0), row(9017, 1)]);
    scriptSplit(0, [placeSite(901, 1), placeSite(902, 2)], [], [handLink]);
    dbMock.enqueueFor("select", "cell_matches", []);
    dbMock.enqueueFor("select", "stations", [REMOTE]);
    dbMock.enqueueFor("select", "cell_copies", []);
    dbMock.enqueueFor("select", "cell_bins", bins);
    dbMock.enqueueFor("insert", "site_links", []);
    scriptLinkingAndDirtying();

    await applySiteSplits();

    expect(written("insert", "site_links")).toEqual([[{ ...handLink, observedSiteId: heir }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("clears the rows of sites that are no longer live and stops while no live site has any", async () => {
    dbMock.enqueueFor("delete", "site_splits", []);
    dbMock.enqueueFor("select", "site_splits", []);

    await applySiteSplits();

    expect(writes()).toEqual([["delete", "site_splits", undefined]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("the split our stations ask for", () => {
  it("splits a site whose cells match stations in two places, and takes each other cell to the place nearest its readings", async () => {
    const onSite = [lteCell(9001, 1), lteCell(9002, 2), lteCell(9017, 17), lteCell(9050, 50), lteCell(9060, 60, SITE_ID, "GSM")];
    dbMock.enqueueFor("select", "cell_matches", [atStation(9001, 20, HOST), atStation(9002, 20, HOST), atStation(9017, 21, REMOTE)]);
    dbMock.enqueueFor("select", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_cells", onSite);
    dbMock.enqueueFor("select", "cell_copies", []);
    dbMock.enqueueFor("select", "cell_bins", [binsAround(9001, HOST), binsAround(9017, REMOTE), binsAround(9050, REMOTE)]);
    scriptSplit(2, [placeSite(903, 3), placeSite(904, 4)]);
    dbMock.enqueueFor("select", "cell_matches", [
      { siteId: 903, siteRat: "LTE", cellRat: "LTE", matchedStationId: null, cellStationId: 20, cellCount: 2 },
      { siteId: 904, siteRat: "LTE", cellRat: "LTE", matchedStationId: null, cellStationId: 21, cellCount: 1 },
    ]);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "site_links", []);
    dbMock.enqueueFor("insert", "dirty_sites", []);

    const changed = await splitSitesByStations(dbMock as unknown as DbTx, [SITE_ID]);

    expect(written("insert", "observed_sites")).toEqual([
      [
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 3 },
        { plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 4 },
      ],
    ]);
    expect(movedCells()).toEqual([
      [9001, 903],
      [9002, 903],
      [9060, 903],
      [9017, 904],
      [9050, 904],
    ]);
    expect(written("insert", "site_links")).toEqual([
      [
        { observedSiteId: 903, stationId: 20, kind: "matched" },
        { observedSiteId: 904, stationId: 21, kind: "matched" },
      ],
    ]);
    expect(changed).toEqual([SITE_ID, 903, 904]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("moves a cell to the place of the node that already stands at its station, instead of cutting another one", async () => {
    const hostPart = placeSite(901, 1);
    const remotePart = placeSite(902, 2);
    const onHostPart = [lteCell(9001, 1, 901), lteCell(9002, 2, 901), lteCell(9019, 19, 901)];
    dbMock.enqueueFor(
      "select",
      "cell_matches",
      [atStation(9001, 20, HOST, hostPart), atStation(9002, 20, HOST, hostPart), atStation(9019, 21, REMOTE, hostPart)],
      [atStation(9017, 21, REMOTE, remotePart)],
    );
    dbMock.enqueueFor("select", "observed_sites", [hostPart, remotePart]);
    dbMock.enqueueFor("select", "observed_cells", onHostPart);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    const changed = await splitSitesByStations(dbMock as unknown as DbTx, [901]);

    expect(movedCells()).toEqual([[9019, 902]]);
    expect(written("insert", "observed_sites")).toEqual([]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 901 }, { observedSiteId: 902 }]]);
    expect(changed).toEqual([901, 902]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps the largest group of a site when another part of its node already stands at each of its places", async () => {
    const split = placeSite(901, 1);
    const atHost = placeSite(902, 2);
    const atRemote = placeSite(903, 3);
    dbMock.enqueueFor(
      "select",
      "cell_matches",
      [atStation(9001, 20, HOST, split), atStation(9002, 20, HOST, split), atStation(9017, 21, REMOTE, split)],
      [atStation(9004, 20, HOST, atHost), atStation(9016, 21, REMOTE, atRemote)],
    );
    dbMock.enqueueFor("select", "observed_sites", [split, atHost, atRemote]);
    dbMock.enqueueFor("select", "observed_cells", [lteCell(9001, 1, 901), lteCell(9002, 2, 901), lteCell(9017, 17, 901)]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    const changed = await splitSitesByStations(dbMock as unknown as DbTx, [901]);

    expect(movedCells()).toEqual([[9017, 903]]);
    expect(written("insert", "observed_sites")).toEqual([]);
    expect(changed).toEqual([901, 903]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("never lets two parts of one node trade the cells of a place both hold, but gives them to the lower place", async () => {
    const elsewhere = placeSite(900, 1);
    const lower = placeSite(901, 2);
    const higher = placeSite(902, 3);
    dbMock.enqueueFor(
      "select",
      "cell_matches",
      [
        atStation(9001, 20, HOST, lower),
        atStation(9017, 21, REMOTE, lower),
        atStation(9018, 21, REMOTE, lower),
        atStation(9003, 20, HOST, higher),
        atStation(9030, 23, FAR, higher),
      ],
      [atStation(9016, 21, REMOTE, elsewhere)],
    );
    dbMock.enqueueFor("select", "observed_sites", [elsewhere, lower, higher]);
    dbMock.enqueueFor("select", "observed_cells", [
      lteCell(9001, 1, 901),
      lteCell(9003, 3, 902),
      lteCell(9017, 17, 901),
      lteCell(9018, 18, 901),
      lteCell(9030, 30, 902),
    ]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    const changed = await splitSitesByStations(dbMock as unknown as DbTx, [901, 902]);

    expect(movedCells()).toEqual([
      [9017, 900],
      [9018, 900],
      [9003, 901],
    ]);
    expect(written("insert", "observed_sites")).toEqual([]);
    expect(changed).toEqual([901, 900, 902]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("splits a part along its places with the cells that moved to it in the same run, so none stays on the retired part", async () => {
    const lower = placeSite(901, 1);
    const higher = placeSite(902, 2);
    dbMock.enqueueFor("select", "cell_matches", [
      atStation(9001, 20, HOST, lower),
      atStation(9002, 20, HOST, lower),
      atStation(9017, 21, REMOTE, lower),
      atStation(9003, 20, HOST, higher),
      atStation(9030, 23, FAR, higher),
    ]);
    dbMock.enqueueFor("select", "observed_sites", [lower, higher]);
    dbMock.enqueueFor("select", "observed_cells", [
      lteCell(9001, 1, 901),
      lteCell(9002, 2, 901),
      lteCell(9003, 3, 902),
      lteCell(9017, 17, 901),
      lteCell(9030, 30, 902),
    ]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();
    scriptSplit(2, [placeSite(903, 3), placeSite(904, 4)]);
    scriptLinkingAndDirtying();

    const changed = await splitSitesByStations(dbMock as unknown as DbTx, [901, 902]);

    expect(movedCells()).toEqual([
      [9003, 901],
      [9001, 903],
      [9002, 903],
      [9003, 903],
      [9017, 904],
    ]);
    expect(written("insert", "site_replacements")).toEqual([
      [
        { observedSiteId: 901, replacedBySiteId: 903 },
        { observedSiteId: 901, replacedBySiteId: 904 },
      ],
    ]);
    expect(changed).toEqual([902, 901, 903, 904]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves a site alone while its cells match stations of one place", async () => {
    dbMock.enqueueFor("select", "cell_matches", [atStation(9001, 20, HOST), atStation(9017, 22, ACROSS_THE_STREET)]);

    expect(await splitSitesByStations(dbMock as unknown as DbTx, [SITE_ID])).toEqual([]);
    expect(writes()).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("a new cell of an eNB in several places", () => {
  function scriptPlaces(cells: unknown[]): void {
    dbMock.enqueueFor("select", "observed_cells", cells);
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_sites", [placeSite(902, 2), placeSite(901, 1)]);
    dbMock.enqueueFor("select", "observed_cells", cells);
  }

  it("goes to the place linked to its station, else the one estimated nearest its readings, else the lowest place", async () => {
    const byStation = lteCell(9101, 40, null);
    const byReadings = lteCell(9102, 41, null);
    const unread = lteCell(9103, 42, null);
    scriptPlaces([byStation, byReadings, unread]);
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 9101, matchedStationId: null, cellStationId: 21 }]);
    dbMock.enqueueFor("select", "site_links", [{ observedSiteId: 902, stationId: 21, kind: "matched", linkedById: null }]);
    dbMock.enqueueFor("select", "site_estimates", [estimateAt(901, HOST), estimateAt(902, REMOTE)]);
    dbMock.enqueueFor("select", "cell_copies", []);
    dbMock.enqueueFor("select", "cell_bins", [binsAround(9101, HOST), binsAround(9102, REMOTE)]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    await placeCellsOfSplitNodes();

    expect(movedCells()).toEqual([
      [9101, 902],
      [9102, 902],
      [9103, 901],
    ]);
    expect(written("insert", "dirty_sites")).toEqual([[{ observedSiteId: 901 }, { observedSiteId: 902 }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("goes by its readings past a place that is only suggested for its station", async () => {
    const cell = lteCell(9101, 40, null);
    scriptPlaces([cell]);
    dbMock.enqueueFor("select", "cell_matches", [{ observedCellId: 9101, matchedStationId: null, cellStationId: 21 }]);
    dbMock.enqueueFor("select", "site_links", [{ observedSiteId: 902, stationId: 21, kind: "suggested", linkedById: null }]);
    dbMock.enqueueFor("select", "site_estimates", [estimateAt(901, HOST), estimateAt(902, REMOTE)]);
    dbMock.enqueueFor("select", "cell_copies", []);
    dbMock.enqueueFor("select", "cell_bins", [binsAround(9101, HOST)]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    await placeCellsOfSplitNodes();

    expect(movedCells()).toEqual([[9101, 901]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("gets its eNB's own site, made anew when needed, once the eNB has no places left", async () => {
    const cell = lteCell(9101, 40, null);
    dbMock.enqueueFor("select", "observed_cells", [cell]);
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_cells", [cell]);
    dbMock.enqueueFor("insert", "observed_sites", []);
    dbMock.enqueueFor("select", "observed_sites", [placeSite(950, 0)]);
    dbMock.enqueueFor("update", "observed_cells", []);
    scriptLinkingAndDirtying();

    await placeCellsOfSplitNodes();

    expect(written("insert", "observed_sites")).toEqual([[{ plmn: PLAY, rat: "LTE", nodeId: ENBID, place: 0 }]]);
    expect(movedCells()).toEqual([[9101, 950]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves an NR cell of a gNB without places to the NR placement", async () => {
    dbMock.enqueueFor("select", "observed_cells", [{ id: 9201, plmn: PLUS, rat: "NR", cellKey: 0x123456 * 4096 + 5, observedSiteId: null }]);
    scriptNetwork(PLUS);
    scriptMatcherLocks();
    dbMock.enqueueFor("select", "observed_sites", []);

    await placeCellsOfSplitNodes();

    expect(writes()).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("leaves an NR cell of a network whose gNBs span sites to the NR placement, which gives it a site of its own", async () => {
    dbMock.enqueueFor("select", "observed_cells", [
      { id: 9201, plmn: VERIZON, rat: "NR", cellKey: HUB_GNBID_22 * 2 ** 14 + 17, observedSiteId: null },
    ]);
    scriptNetwork(VERIZON, { operatorId: 9, countryCode: "US" });

    await placeCellsOfSplitNodes();

    expect(writes()).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("LTE cells left on a site that was just retired", () => {
  it("are freed under the matcher's lock", async () => {
    scriptMatcherLocks();
    dbMock.enqueueFor("update", "observed_cells", [{ id: 9101 }, { id: 9102 }]);

    await releaseLteCellsOfRetiredSites();

    expect(dbMock.calls.map((call) => call.operation)).toEqual(["execute", "update"]);
    expect(written("update", "observed_cells")).toEqual([{ observedSiteId: null }]);
    expect(logger.info).toHaveBeenCalledWith("observations.cells.released_from_retired_sites", { cells: 2 });
    expect(dbMock.pendingResults()).toBe(0);
  });
});
