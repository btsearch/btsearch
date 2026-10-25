import { channelRanges, resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { describe, expect, it } from "vitest";

import type { BandRow } from "../../../src/features/bands/serialize.js";
import { bandOfChannel, channelBandIntervals } from "../../../src/features/observed/bandPlans.js";

const B3: BandRow = { id: 3, value: 1800, rat: "LTE", name: "LTE 1800", duplex: "FDD", variant: "commercial", code: "B3" };
const B20: BandRow = { id: 20, value: 800, rat: "LTE", name: "LTE 800", duplex: "FDD", variant: "commercial", code: "B20" };
const N77: BandRow = { id: 77, value: 3700, rat: "NR", name: "NR 3700", duplex: "TDD", variant: "commercial", code: "n77" };
const N78: BandRow = { id: 78, value: 3500, rat: "NR", name: "NR 3500", duplex: "TDD", variant: "commercial", code: "n78" };
const DCS1800: BandRow = { id: 180, value: 1800, rat: "GSM", name: "GSM 1800", duplex: null, variant: "commercial", code: "DCS1800" };
const PCS1900: BandRow = { id: 190, value: 1900, rat: "GSM", name: "GSM 1900", duplex: null, variant: "commercial", code: "PCS1900" };
const UNKNOWN_LTE: BandRow = { id: 1, value: 0, rat: "LTE", name: "LTE unknown", duplex: null, variant: "commercial", code: null };

function channelsOf(plan: readonly BandRow[]): { rat: BandRow["rat"]; channel: number }[] {
  return plan.flatMap((band) => {
    const catalog = resolveCatalogBand(band);
    const ranges = catalog ? channelRanges(catalog) : [];
    return ranges.flatMap(([first, last]) =>
      [first - 1, first, last, last + 1, Math.floor((first + last) / 2)].map((channel) => ({ rat: band.rat, channel })),
    );
  });
}

function bandFromIntervals(plan: readonly BandRow[], rat: BandRow["rat"], channel: number): number | null {
  const interval = channelBandIntervals(plan).find((band) => band.rat === rat && band.firstChannel <= channel && band.lastChannel >= channel);
  return interval?.bandId ?? null;
}

describe("channelBandIntervals", () => {
  it.each([
    ["two LTE bands that do not overlap", [B3, B20]],
    ["n77 and n78, which overlap, both in the plan", [N77, N78]],
    ["only n78 of the two", [N78]],
    ["GSM 1800 and 1900, which share their channel numbers", [DCS1800, PCS1900]],
    ["only GSM 1800", [DCS1800]],
  ])("gives each channel the band bandOfChannel gives it: %s", (_, plan) => {
    for (const { rat, channel } of channelsOf(plan))
      expect([rat, channel, bandFromIntervals(plan, rat, channel)]).toEqual([rat, channel, bandOfChannel(rat, channel, plan)]);
  });

  it("leaves a channel two bands of the plan hold without a band", () => {
    const [shared] = channelRanges(resolveCatalogBand(N78)!);
    expect(bandFromIntervals([N77, N78], "NR", shared![0])).toBeNull();
    expect(bandFromIntervals([N78], "NR", shared![0])).toBe(N78.id);
  });

  it("makes no interval of the unknown band", () => {
    expect(channelBandIntervals([UNKNOWN_LTE])).toEqual([]);
  });
});
