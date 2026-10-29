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
const VODAFONE = "23415";
const O2 = "23410";
const EE = "23430";
const PLUS_POLAND = "26001";
const PLAY_POLAND = "26006";

const known: KnownPlmns = new Map([
  [VODAFONE, { id: 1, code: VODAFONE, countryCode: "GB" }],
  [O2, { id: 2, code: O2, countryCode: "GB" }],
  [EE, { id: 3, code: EE, countryCode: "GB" }],
  [PLUS_POLAND, { id: 4, code: PLUS_POLAND, countryCode: "PL" }],
  [PLAY_POLAND, { id: 5, code: PLAY_POLAND, countryCode: "PL" }],
]);

function cellWith(overrides: Partial<NetworkedCell> = {}): NetworkedCell {
  return { id: CELL_ID, stationId: STATION_ID, rat: "LTE", ownerCode: VODAFONE, extraCodes: [], countryCode: "GB", ...overrides };
}

function observed(overrides: Partial<MatchedObservedCell> = {}): MatchedObservedCell {
  return {
    cellId: CELL_ID,
    observedCellId: 50411,
    observedSiteId: 9205,
    plmn: VODAFONE,
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
    ownPlmn: VODAFONE,
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
    const flags = raise(cellWith({ extraCodes: [EE] }), [observed({ observedCellId: 50412, plmn: O2, networkMatch: "missingCode", samples: 31 })]);

    expect(flags).toEqual([
      {
        kind: "networkMissing",
        subjectKey: `cell:${CELL_ID}:${O2}`,
        refs: { stationId: STATION_ID, cellId: CELL_ID, observedCellId: 50412, observedSiteId: 9205 },
        evidence: { network: O2, seenAs: "missingCode", samples: 31, people: 2, lastSeenOn: "2026-10-20" },
        suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [VODAFONE, O2, EE] }] },
        measure: { people: 2 },
      },
    ]);
  });

  it("opens for a network two people read in the cell's list", () => {
    const [flag] = raise(cellWith(), [observed()], [listed(VODAFONE, { sampleCount: 80 }), listed(EE)]);

    expect(flag).toMatchObject({
      kind: "networkMissing",
      evidence: { network: EE, seenAs: "list", samples: 12, people: 2 },
      suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [VODAFONE, EE] }] },
    });
  });

  it("opens nothing for a partner's cell, an unknown code, another country's code, one reader, or a list already at its limit", () => {
    const partner = observed({ plmn: O2, networkMatch: "partner" });
    expect(raise(cellWith(), [partner], [listed(O2, { networkMatch: "partner" })])).toEqual([]);
    expect(raise(cellWith(), [observed()], [listed("23499"), listed(PLUS_POLAND), listed(EE, { contributorBits: ANIA })])).toEqual([]);
    expect(raise(cellWith({ extraCodes: ["23401", "23402", "23403", "23404", "23405"] }), [observed()], [listed(EE)])).toEqual([]);
  });

  it("skips GSM, whose cells have no extra codes", () => {
    expect(raise(cellWith({ rat: "GSM" }), [observed({ plmn: O2, networkMatch: "missingCode" })])).toEqual([]);
  });

  it("skips a cell in a country whose pack switches cell networks off", () => {
    const polishCell = cellWith({ ownerCode: PLUS_POLAND, countryCode: "PL" });
    expect(raise(polishCell, [observed({ plmn: PLAY_POLAND, networkMatch: "missingCode" })])).toEqual([]);
  });
});

describe("networkNotSeen", () => {
  const sharedCell = cellWith({ extraCodes: [O2] });
  const lists = [listed(VODAFONE, { sampleCount: 90 }), listed(O2, { lastSeenOn: "2026-06-01" })];

  it("opens for a listed network no list named in 90 days while two people read the cell's lists, suggesting the list without it", () => {
    expect(raise(sharedCell, [observed()], lists)).toEqual([
      {
        kind: "networkNotSeen",
        subjectKey: `cell:${CELL_ID}:${O2}`,
        refs: { stationId: STATION_ID, cellId: CELL_ID, observedCellId: 50411, observedSiteId: 9205 },
        evidence: { network: O2, readingsWithList: 90, people: 2, lastListedOn: "2026-06-01" },
        suggestion: { cells: [{ action: "update", id: CELL_ID, plmns: [VODAFONE] }] },
        measure: { people: 2 },
      },
    ]);
  });

  it("opens nothing while only one person read the lists", () => {
    expect(raise(sharedCell, [observed()], [listed(VODAFONE, { contributorBits: ANIA })])).toEqual([]);
  });

  it("never suggests dropping the owner's main code", () => {
    expect(raise(cellWith({ extraCodes: [VODAFONE] }), [observed()], [listed(VODAFONE)])).toEqual([]);
  });

  it("opens nothing while a copy under that network is still seen", () => {
    const copy = observed({ observedCellId: 50419, plmn: O2, networkMatch: "extraCode", lastSeenOn: "2026-10-01" });
    expect(raise(sharedCell, [observed(), copy], lists)).toEqual([]);
  });
});
