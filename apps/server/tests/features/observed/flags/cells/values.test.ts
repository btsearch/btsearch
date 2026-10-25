import type { CountryFeatures } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import { type ObservedValueRow, raiseValueFlags } from "../../../../../src/features/observed/flags/cells/values.js";
import { storedCellRows } from "../../../../helpers/flagFixtures.js";

const STATION_ID = 40077;
const CELL_ID = 880345;
const SEEN_SINCE = "2026-10-01";
const ANIA = 0b01n;
const BARTEK = 0b10n;
const SWITCHES_OFF: CountryFeatures = { structureOwnerProposals: false, psc: false, bsic: false, observationsPublic: true };

const lteCell = storedCellRows({ rat: "lte", bandId: 3, enbid: 123456, clid: 11, tac: 52010, pci: 214, earfcn: 1300 }, CELL_ID, STATION_ID);

function seen(field: ObservedValueRow["field"], value: number, overrides: Partial<ObservedValueRow> = {}): ObservedValueRow {
  return {
    cellId: CELL_ID,
    observedCellId: 50411,
    observedSiteId: 9205,
    networkMatch: "own",
    field,
    value,
    sampleCount: 23,
    contributorBits: ANIA | BARTEK,
    lastSeenOn: "2026-10-30",
    ...overrides,
  };
}

function judge(values: ObservedValueRow[], cell = lteCell, features = SWITCHES_OFF) {
  return raiseValueFlags({ cells: [cell], values, featuresByStation: new Map([[STATION_ID, features]]), seenSince: SEEN_SINCE });
}

function raise(values: ObservedValueRow[], cell = lteCell, features = SWITCHES_OFF) {
  return judge(values, cell, features).raised;
}

describe("valueDiffers and valueMissing", () => {
  it("suggest a re-planned PCI once the stored one is no longer among the values two people saw in the last 30 days", () => {
    const flags = raise([seen("pci", 214, { lastSeenOn: "2026-09-20" }), seen("pci", 301, { sampleCount: 46 })]);

    expect(flags).toEqual([
      {
        kind: "valueDiffers",
        subjectKey: `cell:${CELL_ID}:pci`,
        refs: { stationId: STATION_ID, cellId: CELL_ID, observedCellId: 50411, observedSiteId: 9205 },
        evidence: { field: "pci", observed: 301, stored: 214, samples: 46, people: 2, lastSeenOn: "2026-10-30" },
        suggestion: { cells: [{ action: "update", id: CELL_ID, pci: 301 }] },
        measure: { value: 301, people: 2 },
      },
    ]);
  });

  it("count a field whose stored value phones confirm as settled by the database, and one phones no longer confirm as not", () => {
    const settled = [
      { kind: "valueDiffers", subjectKey: `cell:${CELL_ID}:pci` },
      { kind: "valueMissing", subjectKey: `cell:${CELL_ID}:pci` },
    ];

    expect(judge([seen("pci", 214), seen("pci", 301)]).fixed).toEqual(settled);
    expect(judge([seen("pci", 214, { lastSeenOn: "2026-09-20" })]).fixed).toEqual([]);
  });

  it("raise nothing while the stored value is still confirmed in the last 30 days, even beside a newer one", () => {
    expect(raise([seen("pci", 214, { lastSeenOn: "2026-10-10" }), seen("pci", 301)])).toEqual([]);
  });

  it("raise nothing for a value only one person reported, however often", () => {
    expect(raise([seen("pci", 301, { contributorBits: ANIA, sampleCount: 900 })])).toEqual([]);
  });

  it("count the people of every observed cell matched to the cell, copies included, and name the one with most samples", () => {
    const flags = raise([
      seen("pci", 301, { observedCellId: 50411, contributorBits: ANIA, sampleCount: 5 }),
      seen("pci", 301, { observedCellId: 50412, observedSiteId: 9206, contributorBits: BARTEK, sampleCount: 40 }),
    ]);

    expect(flags).toMatchObject([{ refs: { observedCellId: 50412, observedSiteId: 9206 }, evidence: { observed: 301, samples: 45, people: 2 } }]);
  });

  it("take no area code from an observed cell matched through an extra code, and nothing from a partner's", () => {
    expect(raise([seen("areaCode", 61001, { networkMatch: "extraCode" }), seen("pci", 301, { networkMatch: "extraCode" })])).toMatchObject([
      { evidence: { field: "pci" } },
    ]);
    expect(raise([seen("areaCode", 61001, { networkMatch: "partner" }), seen("pci", 301, { networkMatch: "partner" })])).toEqual([]);
  });

  it("follow the country's psc switch for a UMTS cell", () => {
    const umtsCell = storedCellRows({ rat: "umts", bandId: 2, lac: 4100, rnc: 1, cid: 2, psc: 100, uarfcn: 10763 }, CELL_ID, STATION_ID);
    const values = [seen("pci", 101)];

    expect(raise(values, umtsCell)).toEqual([]);
    expect(raise(values, umtsCell, { ...SWITCHES_OFF, psc: true })).toMatchObject([
      { kind: "valueDiffers", suggestion: { cells: [{ action: "update", id: CELL_ID, psc: 101 }] } },
    ]);
  });

  it("ask a GSM cell only for its BSIC", () => {
    const gsmCell = storedCellRows({ rat: "gsm", bandId: 1, lac: 4100, cid: 2, bsic: 10 }, CELL_ID, STATION_ID);
    const flags = raise([seen("areaCode", 4200), seen("pci", 12), seen("channel", 62)], gsmCell, { ...SWITCHES_OFF, bsic: true });

    expect(flags).toMatchObject([{ subjectKey: `cell:${CELL_ID}:pci`, suggestion: { cells: [{ action: "update", id: CELL_ID, bsic: 12 }] } }]);
  });

  it("open valueMissing for an empty TAC that two people reported", () => {
    const withoutTac = storedCellRows({ rat: "lte", bandId: 3, enbid: 123456, clid: 11, pci: 214, earfcn: 1300 }, CELL_ID, STATION_ID);

    expect(raise([seen("areaCode", 52011)], withoutTac)).toMatchObject([
      {
        kind: "valueMissing",
        evidence: { field: "areaCode", observed: 52011, stored: null },
        suggestion: { cells: [{ action: "update", id: CELL_ID, tac: 52011 }] },
      },
    ]);
  });
});
