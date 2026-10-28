import { calculateDistance } from "@openbts/shared/geo";
import { calculateLinkDirectionalSpeeds, groupMicrowaveLinks } from "@openbts/shared/microwaveLinkUtils";
import { describe, expect, it } from "vitest";

import {
  type MicrowaveLinkSnapshotCount,
  type SnapshotLinkDirection,
  buildMicrowaveLinkSnapshot,
} from "../../../../src/features/stats/microwaveLinks/snapshot.js";

type End = { latitude: number; longitude: number };
type Channel = Partial<Omit<SnapshotLinkDirection, "tx" | "rx">>;

const A = { latitude: 52, longitude: 21 };
const B = { latitude: 52.018, longitude: 21 };
const C = { latitude: 52.0045, longitude: 21 };
const D = { latitude: 52.225, longitude: 21 };
const DUPLEX_SPACING_MHZ = 1010;

function direction(tx: End, rx: End, channel: Channel = {}): SnapshotLinkDirection {
  return {
    licenseeId: 1,
    permit: { number: "P/1" },
    tx,
    rx,
    frequencyMhz: 18_000,
    polarization: "H",
    channelWidthMhz: 56,
    modulation: "256QAM",
    vendor: "Huawei Technologies Co.,Ltd",
    ...channel,
  };
}

function link(ends: [End, End], ...channels: Channel[]): SnapshotLinkDirection[] {
  const [from, to] = ends;
  const forward = channels.map((channel) => direction(from, to, channel));
  const reverse = channels.map((channel) => direction(to, from, { ...channel, frequencyMhz: (channel.frequencyMhz ?? 18_000) + DUPLEX_SPACING_MHZ }));
  return [...forward, ...reverse];
}

function bucketsOf(counts: readonly MicrowaveLinkSnapshotCount[], dimension: string): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const count of counts) {
    if (count.dimension === dimension) buckets[count.bucket ?? "unknown"] = (buckets[count.bucket ?? "unknown"] ?? 0) + count.linksCount;
  }
  return buckets;
}

describe("the microwave link snapshot", () => {
  it("counts the directions under one licensee and permit, or between one pair of ends without a permit, as one link", () => {
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, B], {}),
      ...link([A, B], { licenseeId: 2 }),
      direction(C, D, { permit: { number: null } }),
      direction(D, C, { permit: { number: null }, frequencyMhz: 19_010 }),
    ]);

    const totals = counts.filter(({ dimension }) => dimension === "total").map(({ licenseeId, linksCount }) => ({ licenseeId, linksCount }));
    expect(totals).toEqual([
      { licenseeId: 1, linksCount: 2 },
      { licenseeId: 2, linksCount: 1 },
    ]);
    for (const dimension of ["band", "length", "type", "capacity", "vendor"]) {
      expect(Object.values(bucketsOf(counts, dimension)).reduce((sum, links) => sum + links, 0)).toBe(3);
    }
  });

  it("tells FDD, 2+0 FDD, XPIC, 2+0 XPIC and SD links apart and puts any other layout under other", () => {
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, B], { permit: { number: "FDD" } }),
      ...link([A, B], { permit: { number: "2+0" } }, { permit: { number: "2+0" }, frequencyMhz: 18_056 }),
      ...link([A, B], { permit: { number: "2+0 alternating" } }, { permit: { number: "2+0 alternating" }, frequencyMhz: 18_056, polarization: "V" }),
      ...link([A, B], { permit: { number: "XPIC" } }, { permit: { number: "XPIC" }, polarization: "V" }),
      ...link(
        [A, B],
        ...[18_000, 18_056].flatMap((frequencyMhz) => [
          { permit: { number: "2+0 XPIC" }, frequencyMhz },
          { permit: { number: "2+0 XPIC" }, frequencyMhz, polarization: "V" },
        ]),
      ),
      ...link([A, B], { permit: { number: "SD" } }, { permit: { number: "SD" } }),
      ...link(
        [A, B],
        { permit: { number: "odd" } },
        { permit: { number: "odd" }, polarization: "V" },
        { permit: { number: "odd" }, frequencyMhz: 18_056 },
        { permit: { number: "odd" }, frequencyMhz: 18_112 },
      ),
      ...link(
        [A, B],
        { permit: { number: "half XPIC" } },
        { permit: { number: "half XPIC" }, polarization: "V" },
        { permit: { number: "half XPIC" }, frequencyMhz: 18_056 },
      ),
    ]);

    expect(bucketsOf(counts, "type")).toEqual({ FDD: 1, "2+0 FDD": 2, XPIC: 1, "2+0 XPIC": 1, SD: 1, other: 2 });
  });

  it("buckets a link by its faster direction, adding up its channels but counting the second path of an SD link once", () => {
    const sd = link([A, B], { permit: { number: "SD" } }, { permit: { number: "SD" } });
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, B], { permit: { number: "FDD" } }),
      ...link([A, B], { permit: { number: "XPIC" } }, { permit: { number: "XPIC" }, polarization: "V" }),
      ...sd,
      ...link(
        [A, B],
        ...[18_000, 18_112].flatMap((frequencyMhz) => [
          { permit: { number: "2+0 XPIC" }, frequencyMhz, channelWidthMhz: 112, modulation: "1024QAM" },
          { permit: { number: "2+0 XPIC" }, frequencyMhz, channelWidthMhz: 112, modulation: "1024QAM", polarization: "V" },
        ]),
      ),
      direction(A, B, { permit: { number: "uneven" }, channelWidthMhz: 112, modulation: "512QAM" }),
      direction(B, A, { permit: { number: "uneven" }, frequencyMhz: 19_010, channelWidthMhz: 28, modulation: "QPSK" }),
      ...link([A, B], { permit: { number: "E-band" }, frequencyMhz: 73_500, channelWidthMhz: 2000, modulation: "1024 QAM" }),
    ]);

    const [sdLink] = groupMicrowaveLinks(sd);
    const sdSpeeds = calculateLinkDirectionalSpeeds(sdLink!);
    expect(sdSpeeds.dl).toBeCloseTo(380.8);
    expect(sdSpeeds.ul).toBeCloseTo(380.8);
    expect(bucketsOf(counts, "capacity")).toEqual({ "<512": 2, "512-1000": 2, "2000-5000": 1, ">=10000": 1 });
  });

  it("leaves the capacity unknown when no channel has both a width and a modulation it can read", () => {
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, B], { permit: { number: "none" }, modulation: null }),
      ...link([A, B], { permit: { number: "unread" }, modulation: "ACM" }),
      ...link([A, B], { permit: { number: "no width" }, channelWidthMhz: null }),
      direction(A, B, { permit: { number: "one way" } }),
      direction(B, A, { permit: { number: "one way" }, frequencyMhz: 19_010, modulation: null }),
    ]);

    expect(bucketsOf(counts, "capacity")).toEqual({ unknown: 3, "<512": 1 });
  });

  it("buckets bands by frequency, with other outside the known bands, and hops by the distance between the ends", () => {
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, C], { permit: { number: "short" }, frequencyMhz: 73_500 }),
      ...link([A, B], { permit: { number: "medium" }, frequencyMhz: 7125 }),
      ...link([A, D], { permit: { number: "long" }, frequencyMhz: 50_000 }),
    ]);

    expect(bucketsOf(counts, "band")).toEqual({ "70/80": 1, "7": 1, other: 1 });
    expect(bucketsOf(counts, "length")).toEqual({ "<1": 1, "1-3": 1, ">=20": 1 });
    const total = counts.find(({ dimension }) => dimension === "total");
    const distances = [C, B, D].map((end) => calculateDistance(A.latitude, A.longitude, end.latitude, end.longitude));
    expect(total?.lengthSumMeters).toBe(Math.round(distances.reduce((sum, meters) => sum + meters, 0)));
  });

  it("names each link's vendor by the short name of its most common transmitter maker, and keeps a name it does not know", () => {
    const counts = buildMicrowaveLinkSnapshot([
      ...link([A, B], { permit: { number: "1" } }),
      ...link([A, B], { permit: { number: "2" }, vendor: "ERICSSON" }),
      ...link([A, B], { permit: { number: "3" }, vendor: "Aviat Networks (d. Harris Stratex Networks)" }),
      ...link([A, B], { permit: { number: "4" }, vendor: "  Radio   Works  " }),
      ...link([A, B], { permit: { number: "5" }, vendor: null }),
      direction(A, B, { permit: { number: "6" }, vendor: "NEC" }),
      direction(A, B, { permit: { number: "6" }, vendor: "ERICSSON", polarization: "V" }),
      direction(B, A, { permit: { number: "6" }, vendor: "NEC", frequencyMhz: 19_010 }),
      direction(B, A, { permit: { number: "6" }, vendor: "NEC", frequencyMhz: 19_010, polarization: "V" }),
    ]);

    expect(bucketsOf(counts, "vendor")).toEqual({ Huawei: 1, Ericsson: 1, Aviat: 1, "Radio Works": 1, unknown: 1, NEC: 1 });
  });
});
