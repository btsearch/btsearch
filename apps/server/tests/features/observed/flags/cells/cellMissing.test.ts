import { knownGnbidLength } from "@openbts/country-packs";
import { cellApplySchema } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import type { BandRow } from "../../../../../src/features/bands/serialize.js";
import type { KnownPlmns } from "../../../../../src/features/cells/networkWrites.js";
import {
  type MissingCellInput,
  type SiteCell,
  findMissingCells,
  raiseMissingCellFlags,
  siteStationKey,
} from "../../../../../src/features/observed/flags/cells/cellMissing.js";

const STATION_ID = 40077;
const SITE_ID = 9205;
const PLUS = "26001";
const PLAY = "26006";
const ORANGE = "26003";
const ANIA = 0b01n;
const BOTH = 0b11n;
const B20: BandRow = { id: 20, value: 800, rat: "LTE", name: "LTE800", duplex: "FDD", variant: "commercial", code: "B20" };
const N78: BandRow = { id: 78, value: 3500, rat: "NR", name: "NR3500", duplex: "TDD", variant: "commercial", code: "n78" };
const OWN_SITE = new Set([siteStationKey(SITE_ID, STATION_ID)]);
const SEEN_SINCE = "2026-07-27";

const known: KnownPlmns = new Map([
  [PLUS, { id: 1, code: PLUS, countryCode: "PL" }],
  [PLAY, { id: 6, code: PLAY, countryCode: "PL" }],
  [ORANGE, { id: 3, code: ORANGE, countryCode: "PL" }],
]);

function siteCell(overrides: Partial<SiteCell> = {}): SiteCell {
  return {
    id: 50411,
    plmn: PLUS,
    rat: "LTE",
    cellKey: 123456 * 256 + 3,
    observedSiteId: SITE_ID,
    stationId: STATION_ID,
    countryCode: "PL",
    isConfirmed: true,
    isCopy: false,
    matchedCellId: null,
    networkMatch: null,
    samples: 64,
    people: 3,
    lastSeenOn: "2026-10-20",
    ...overrides,
  };
}

function seen(field: "areaCode" | "pci" | "channel", value: number, observedCellId = 50411) {
  return { observedCellId, observedSiteId: SITE_ID, field, value, sampleCount: 20, contributorBits: BOTH, lastSeenOn: "2026-10-20" };
}

type RaiseOptions = { ownerCode?: string; planBands?: BandRow[]; listedNetworks?: MissingCellInput["listedNetworks"] };

function raise(
  cells: SiteCell[],
  values: MissingCellInput["values"],
  { ownerCode = PLUS, planBands = [B20], listedNetworks = [] }: RaiseOptions = {},
) {
  return raiseMissingCellFlags({
    cells: findMissingCells(cells, OWN_SITE, SEEN_SINCE),
    values,
    listedNetworks,
    stations: new Map([[STATION_ID, { ownerCode, countryCode: "PL", planBands }]]),
    context: { known, gnbidLengths: new Map([[PLAY, knownGnbidLength("260", "06") ?? 0]]) },
  });
}

describe("cellMissing", () => {
  const lteValues = [seen("areaCode", 52010), seen("pci", 214), seen("channel", 6300)];

  it("opens for a confirmed LTE cell on a matched eNB, with a create item POST /cells/apply takes as it is", () => {
    const [flag, ...others] = raise([siteCell()], lteValues);

    expect(others).toEqual([]);
    expect(flag).toEqual({
      kind: "cellMissing",
      subjectKey: `observedCell:${PLUS}:LTE:${123456 * 256 + 3}`,
      refs: { observedCellId: 50411, observedSiteId: SITE_ID, stationId: STATION_ID },
      evidence: { samples: 64, people: 3, lastSeenOn: "2026-10-20" },
      suggestion: {
        cells: [{ action: "create", rat: "lte", bandId: B20.id, tac: 52010, enbid: 123456, clid: 3, pci: 214, earfcn: 6300, plmns: [PLUS] }],
      },
      measure: { people: 3 },
    });
    expect(cellApplySchema.safeParse({ stationId: STATION_ID, cells: flag?.suggestion.cells, observationFlagIds: [4101] }).success).toBe(true);
  });

  it("cuts a Play NR cell with its 28-bit gNB ID", () => {
    const nci = 1234567 * 2 ** 8 + 5;
    const values = [seen("pci", 400, 50420), seen("channel", 640000, 50420)];
    const [flag] = raise([siteCell({ id: 50420, plmn: PLAY, rat: "NR", cellKey: nci })], values, { ownerCode: PLAY, planBands: [N78] });

    expect(flag?.suggestion.cells).toEqual([
      {
        action: "create",
        rat: "nr",
        bandId: N78.id,
        mode: "sa",
        tac: null,
        gnbid: 1234567,
        gnbidLength: 28,
        clid: 5,
        pci: 400,
        arfcn: 640000,
        plmns: [PLAY],
      },
    ]);
    expect(cellApplySchema.safeParse({ stationId: STATION_ID, cells: flag?.suggestion.cells, observationFlagIds: [4101] }).success).toBe(true);
  });

  it("lists the owner's main code first, then the known networks two people read in the cell's list", () => {
    const listing = (plmn: string, contributorBits: bigint) => ({
      observedCellId: 50411,
      observedSiteId: SITE_ID,
      plmn,
      sampleCount: 20,
      contributorBits,
      lastSeenOn: "2026-10-20",
    });
    const listedNetworks = [listing(PLAY, BOTH), listing(ORANGE, ANIA), listing("26099", BOTH)];
    const [flag] = raise([siteCell()], lteValues, { listedNetworks });

    expect(flag?.suggestion.cells).toMatchObject([{ plmns: [PLUS, PLAY] }]);
  });

  it("opens nothing for a copy, an unconfirmed cell, a partner's cell, a cell of ours, or a site matched only through a partner", () => {
    const left = [
      siteCell({ isCopy: true }),
      siteCell({ isConfirmed: false }),
      siteCell({ networkMatch: "partner" }),
      siteCell({ matchedCellId: 880345, networkMatch: "own" }),
    ];
    expect(raise(left, lteValues)).toEqual([]);
    expect(findMissingCells([siteCell()], new Set(), SEEN_SINCE)).toEqual([]);
  });

  it("opens nothing for a cell phones last saw more than 90 days ago, so its open flag resolves", () => {
    expect(raise([siteCell({ lastSeenOn: "2026-07-26" })], lteValues)).toEqual([]);
  });

  it("waits while the channel fits no band of the country's plan", () => {
    expect(raise([siteCell()], lteValues, { planBands: [N78] })).toEqual([]);
  });
});
