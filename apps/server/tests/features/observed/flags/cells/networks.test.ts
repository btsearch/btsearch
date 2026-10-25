import { describe, expect, it } from "vitest";

import type { KnownPlmns } from "../../../../../src/features/cells/networkWrites.js";
import {
  type ListedNetworkRow,
  type MatchedObservedCell,
  type NetworkedCell,
  raiseNetworkFlags,
} from "../../../../../src/features/observed/flags/cells/networks.js";

const CELL_ID = 880345;
const STATION_ID = 40077;
const SEEN_SINCE = "2026-07-27";
const ANIA = 0b01n;
const BARTEK = 0b10n;
const PLUS = "26001";
const T_MOBILE = "26002";
const ORANGE = "26003";
const VODAFONE_UK = "23415";

const known: KnownPlmns = new Map([
  [PLUS, { id: 1, code: PLUS, countryCode: "PL" }],
  [T_MOBILE, { id: 2, code: T_MOBILE, countryCode: "PL" }],
  [ORANGE, { id: 3, code: ORANGE, countryCode: "PL" }],
  [VODAFONE_UK, { id: 4, code: VODAFONE_UK, countryCode: "GB" }],
]);

function cellWith(overrides: Partial<NetworkedCell> = {}): NetworkedCell {
  return { id: CELL_ID, stationId: STATION_ID, rat: "LTE", ownerCode: PLUS, extraCodes: [], countryCode: "PL", ...overrides };
}

function observed(overrides: Partial<MatchedObservedCell> = {}): MatchedObservedCell {
  return {
    cellId: CELL_ID,
    observedCellId: 50411,
    observedSiteId: 9205,
    plmn: PLUS,
    networkMatch: "own",
    samples: 40,
    people: 2,
    lastSeenOn: "2026-10-20",
    ...overrides,
  };
}

function listed(plmn: string, overrides: Partial<ListedNetworkRow> = {}): ListedNetworkRow {
  return {
    cellId: CELL_ID,
    observedCellId: 50411,
    observedSiteId: 9205,
    ownPlmn: PLUS,
    networkMatch: "own",
    plmn,
    sampleCount: 12,
    contributorBits: ANIA | BARTEK,
    lastSeenOn: "2026-10-20",
    ...overrides,
  };
}

function raise(cell: NetworkedCell, observedCells: MatchedObservedCell[], listedNetworks: ListedNetworkRow[] = []) {
  return raiseNetworkFlags({ cells: [cell], observedCells, listedNetworks, known, seenSince: SEEN_SINCE });
}

describe("networkMissing", () => {
  it("opens for a cell two people saw under a code our cell does not broadcast, suggesting the whole list with the owner's code first", () => {
    const flags = raise(cellWith({ extraCodes: [ORANGE] }), [
      observed({ observedCellId: 50412, plmn: T_MOBILE, networkMatch: "missingCode", samples: 31 }),
    ]);

    expect(flags).toEqual([
      {
        kind: "networkMissing",
        subjectKey: `cell:${CELL_ID}:${T_MOBILE}`,
        refs: { stationId: STATION_ID, cellId: CELL_ID, observedCellId: 50412, observedSiteId: 9205 },
        evidence: { network: T_MOBILE, seenAs: "missingCode", samples: 31, people: 2, lastSeenOn: "2026-10-20" },
        suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [PLUS, T_MOBILE, ORANGE] }] },
        measure: { people: 2 },
      },
    ]);
  });

  it("opens for a network two people read in the cell's list", () => {
    const [flag] = raise(cellWith(), [observed()], [listed(PLUS, { sampleCount: 80 }), listed(ORANGE)]);

    expect(flag).toMatchObject({
      kind: "networkMissing",
      evidence: { network: ORANGE, seenAs: "list", samples: 12, people: 2 },
      suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [PLUS, ORANGE] }] },
    });
  });

  it("opens nothing for a partner's cell, an unknown code, another country's code, one reader, or a list already at its limit", () => {
    const partner = observed({ plmn: T_MOBILE, networkMatch: "partner" });
    expect(raise(cellWith(), [partner], [listed(T_MOBILE, { networkMatch: "partner" })])).toEqual([]);
    expect(raise(cellWith(), [observed()], [listed("26099"), listed(VODAFONE_UK), listed(ORANGE, { contributorBits: ANIA })])).toEqual([]);
    expect(raise(cellWith({ extraCodes: ["26004", "26005", "26006", "26007", "26008"] }), [observed()], [listed(ORANGE)])).toEqual([]);
  });

  it("skips GSM, whose cells have no extra codes", () => {
    expect(raise(cellWith({ rat: "GSM" }), [observed({ plmn: T_MOBILE, networkMatch: "missingCode" })])).toEqual([]);
  });
});

describe("networkNotSeen", () => {
  const sharedCell = cellWith({ extraCodes: [T_MOBILE] });
  const lists = [listed(PLUS, { sampleCount: 90 }), listed(T_MOBILE, { lastSeenOn: "2026-06-01" })];

  it("opens for a listed network no list named in 90 days while two people read the cell's lists, suggesting the list without it", () => {
    expect(raise(sharedCell, [observed()], lists)).toEqual([
      {
        kind: "networkNotSeen",
        subjectKey: `cell:${CELL_ID}:${T_MOBILE}`,
        refs: { stationId: STATION_ID, cellId: CELL_ID, observedCellId: 50411, observedSiteId: 9205 },
        evidence: { network: T_MOBILE, readingsWithList: 90, people: 2, lastListedOn: "2026-06-01" },
        suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [PLUS] }] },
        measure: { people: 2 },
      },
    ]);
  });

  it("opens nothing while only one person read the lists", () => {
    expect(raise(sharedCell, [observed()], [listed(PLUS, { contributorBits: ANIA })])).toEqual([]);
  });

  it("never suggests dropping the owner's main code", () => {
    expect(raise(cellWith({ extraCodes: [PLUS] }), [observed()], [listed(PLUS)])).toEqual([]);
  });

  it("opens nothing while a copy under that network is still seen", () => {
    const copy = observed({ observedCellId: 50419, plmn: T_MOBILE, networkMatch: "extraCode", lastSeenOn: "2026-10-01" });
    expect(raise(sharedCell, [observed(), copy], lists)).toEqual([]);
  });
});
