import { cellApplyChangeSchema } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import type { BandRow } from "../../../../../src/features/bands/serialize.js";
import type { KnownPlmns } from "../../../../../src/features/cells/networkWrites.js";
import { type NewCellSource, buildNewCell } from "../../../../../src/features/observed/flags/cells/newCell.js";

const PLUS = "26001";
const BOTH = 0b11n;
const E_GSM900: BandRow = { id: 1, value: 900, rat: "GSM", name: "GSM900", duplex: "FDD", variant: "commercial", code: "E-GSM900" };
const UMTS2100: BandRow = { id: 11, value: 2100, rat: "UMTS", name: "UMTS2100", duplex: "FDD", variant: "commercial", code: "I" };
const known: KnownPlmns = new Map([[PLUS, { id: 1, code: PLUS, countryCode: "PL" }]]);
const context = { known, gnbidLengths: new Map<string, number>() };
const switchedOn = { structureOwnerProposals: false, psc: true, bsic: true, observationsPublic: true };

function seen(field: "areaCode" | "pci" | "channel", value: number) {
  return { observedCellId: 61200, observedSiteId: 9350, field, value, sampleCount: 20, contributorBits: BOTH, lastSeenOn: "2026-10-20" };
}

function source(rat: "GSM" | "UMTS", cellKey: number, values: NewCellSource["values"]): NewCellSource {
  return { rat, plmn: PLUS, cellKey, values, listedNetworks: [] };
}

describe("a new GSM or UMTS cell from an observed one", () => {
  const gsm = source("GSM", 58_120 * 65_536 + 4_411, [seen("channel", 62), seen("pci", 37)]);
  const umts = source("UMTS", 41_302 * 65_536 + 27_811, [seen("areaCode", 58_120), seen("pci", 211), seen("channel", 10_737)]);

  it("takes the GSM cell's LAC and CID from its identity, and its BSIC only where the country's switch is on", () => {
    const off = buildNewCell(gsm, { ownerCode: PLUS, countryCode: "PL", planBands: [E_GSM900] }, context);
    const on = buildNewCell(gsm, { ownerCode: PLUS, countryCode: "PL", planBands: [E_GSM900], features: switchedOn }, context);

    expect(off).toEqual({ rat: "gsm", bandId: 1, lac: 58_120, cid: 4_411, plmns: [PLUS] });
    expect(on).toEqual({ rat: "gsm", bandId: 1, lac: 58_120, cid: 4_411, bsic: 37, plmns: [PLUS] });
    expect(cellApplyChangeSchema.safeParse({ action: "create", ...on }).success).toBe(true);
  });

  it("takes the UMTS cell's RNC and CID from its identity and its LAC and UARFCN from the readings, and its PSC only where the switch is on", () => {
    const off = buildNewCell(umts, { ownerCode: PLUS, countryCode: "PL", planBands: [UMTS2100] }, context);
    const on = buildNewCell(umts, { ownerCode: PLUS, countryCode: "PL", planBands: [UMTS2100], features: switchedOn }, context);

    expect(off).toEqual({ rat: "umts", bandId: 11, lac: 58_120, rnc: 41_302, cid: 27_811, uarfcn: 10_737, plmns: [PLUS] });
    expect(on).toMatchObject({ psc: 211 });
    expect(cellApplyChangeSchema.safeParse({ action: "create", ...on }).success).toBe(true);
  });

  it("leaves out a cell whose channel is in no band of the plan", () => {
    expect(buildNewCell(gsm, { ownerCode: PLUS, countryCode: "PL", planBands: [UMTS2100] }, context)).toBeNull();
  });
});
