import { describe, expect, it } from "vitest";

import type { BandRow } from "../../../../src/features/bands/serialize.js";
import { type ChannelSighting, raiseBandFlags } from "../../../../src/features/observed/flags/bands.js";

const ANIA = 0b001n;
const BARTEK = 0b010n;
const CELINA = 0b100n;
const B3: BandRow = { id: 3, value: 1800, rat: "LTE", name: "LTE1800", duplex: "FDD", variant: "commercial", code: "B3" };
const B20: BandRow = { id: 20, value: 800, rat: "LTE", name: "LTE800", duplex: "FDD", variant: "commercial", code: "B20" };
const N77: BandRow = { id: 77, value: 3700, rat: "NR", name: "NR3700", duplex: "TDD", variant: "commercial", code: "n77" };
const N78: BandRow = { id: 78, value: 3500, rat: "NR", name: "NR3500", duplex: "TDD", variant: "commercial", code: "n78" };

const networks = new Map([
  ["26001", { operatorId: 1, countryCode: "PL" }],
  ["26002", { operatorId: 2, countryCode: "PL" }],
  ["23415", { operatorId: 4, countryCode: "GB" }],
]);

function sighting(plmn: string, channel: number, overrides: Partial<ChannelSighting> = {}): ChannelSighting {
  return { plmn, rat: "LTE", channel, samples: 30, contributorBits: ANIA | BARTEK, lastSeenOn: "2026-10-20", ...overrides };
}

function raise(channels: ChannelSighting[], plans = new Map([["PL", [B3, N78]]])) {
  return raiseBandFlags({ channels, networks, plans, bands: [B3, B20, N77, N78] });
}

describe("bandNotInPlan", () => {
  it("opens one flag per country and band, with every channel of the band phones saw on the country's networks", () => {
    const flags = raise([
      sighting("26001", 6300),
      sighting("26002", 6400, { samples: 12, contributorBits: BARTEK | CELINA, lastSeenOn: "2026-10-22" }),
      sighting("23415", 6300),
      sighting("26001", 1300),
    ]);

    expect(flags).toEqual([
      {
        kind: "bandNotInPlan",
        subjectKey: "country:PL:band:20",
        refs: { countryCode: "PL", bandId: 20 },
        evidence: { rat: "lte", channels: [6300, 6400], samples: 42, people: 3, lastSeenOn: "2026-10-22" },
        suggestion: { bandId: 20 },
        measure: { channels: [6300, 6400], people: 3 },
      },
      {
        kind: "bandNotInPlan",
        subjectKey: "country:GB:band:20",
        refs: { countryCode: "GB", bandId: 20 },
        evidence: { rat: "lte", channels: [6300], samples: 30, people: 2, lastSeenOn: "2026-10-20" },
        suggestion: { bandId: 20 },
        measure: { channels: [6300], people: 2 },
      },
    ]);
  });

  it("counts an NR channel in both n77 and n78 as planned when n78 is in the plan, and suggests the narrower band otherwise", () => {
    const channel = sighting("26001", 640000, { rat: "NR" });

    expect(raise([channel])).toEqual([]);
    expect(raise([channel], new Map([["PL", [B3]]]))).toMatchObject([{ subjectKey: "country:PL:band:78", suggestion: { bandId: 78 } }]);
  });

  it("opens nothing for a network missing from the network codes, as no plan can be named", () => {
    expect(raise([sighting("26099", 6300)])).toEqual([]);
  });
});
