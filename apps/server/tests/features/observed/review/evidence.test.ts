import { TIMING_ADVANCE_STEP_METERS } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

import {
  MOST_TIMING_ADVANCE_SQUARES,
  type SquareSighting,
  type TimingAdvanceReading,
  evidenceSourcesOf,
  timingAdvanceSquares,
} from "../../../../src/features/observed/review/evidence.js";
import { quadkeyOf, squareCenter, tileAt } from "../../../../src/features/observed/tiles/squares.js";
import { siteRecord } from "../../../helpers/siteRecordFixtures.js";

const SQUARE = quadkeyOf(tileAt({ latitude: 53.1361, longitude: 23.1542 }, 20));

function reading(overrides: Partial<TimingAdvanceReading> = {}): TimingAdvanceReading {
  return {
    observedCellId: 50211,
    bin: SQUARE,
    rat: "LTE",
    taGroupId: 1,
    source: "api",
    timingAdvance: 12,
    sampleCount: 30,
    weightMilli: 30_000,
    ...overrides,
  };
}

function sighting(overrides: Partial<SquareSighting> = {}): SquareSighting {
  return { observedCellId: 50211, bin: SQUARE, stationaryCount: 2, sampleCount: 40, ...overrides };
}

const asAdmin = { seesAll: true };
const asEditor = { seesAll: false };

function squaresOf(...args: Parameters<typeof timingAdvanceSquares>) {
  return timingAdvanceSquares(...args).timingAdvanceSquares;
}

describe("the timing-advance distances of a site", () => {
  it("reads LTE at the 3GPP step without a calibration, at the square's center", () => {
    const [square] = squaresOf([reading()], [], [], asAdmin);

    expect(square).toEqual({
      ...squareCenter(SQUARE),
      observedCellId: 50211,
      distanceMeters: Math.round(12 * TIMING_ADVANCE_STEP_METERS.lte),
      samples: 30,
    });
  });

  it("uses the group's fitted scale and offset when the estimate's calibration has one", () => {
    const fit = { taGroupId: 1, rat: "lte" as const, metersPerStep: TIMING_ADVANCE_STEP_METERS.lte / 2, offsetMeters: -20 };
    const [square] = squaresOf([reading()], [], [fit], asAdmin);

    expect(square?.distanceMeters).toBe(Math.round((12 * TIMING_ADVANCE_STEP_METERS.lte) / 2 - 20));
  });

  it("takes the weighted median of a square's readings", () => {
    const readings = [reading({ timingAdvance: 10, weightMilli: 1000 }), reading({ timingAdvance: 20, weightMilli: 3000 })];
    const [square] = squaresOf(readings, [], [], asAdmin);

    expect(square?.distanceMeters).toBe(Math.round(20 * TIMING_ADVANCE_STEP_METERS.lte));
    expect(square?.samples).toBe(60);
  });

  it("leaves NR readings from Android out until their group has a fit, and keeps them once it has", () => {
    const nr = reading({ rat: "NR", taGroupId: 3, timingAdvance: 64 });
    const fit = { taGroupId: 3, rat: "nr" as const, metersPerStep: 9.76, offsetMeters: 0 };

    expect(squaresOf([nr], [], [], asAdmin)).toEqual([]);
    expect(squaresOf([nr], [], [fit], asAdmin)[0]?.distanceMeters).toBe(Math.round(64 * 9.76));
    expect(squaresOf([{ ...nr, source: "modemLog" }], [], [], asAdmin)[0]?.distanceMeters).toBe(Math.round(64 * TIMING_ADVANCE_STEP_METERS.nr));
  });

  it.each([
    ["half its samples stood still", [sighting({ stationaryCount: 20 })]],
    ["the square has no coverage row", []],
  ])("shows a square to an administrator and not to an editor when %s", (_case, sightings) => {
    expect(squaresOf([reading()], sightings, [], asAdmin)).toHaveLength(1);
    expect(squaresOf([reading()], sightings, [], asEditor)).toEqual([]);
  });

  it("shows an editor a square measured on the move", () => {
    expect(squaresOf([reading()], [sighting()], [], asEditor)).toHaveLength(1);
  });

  it(`keeps the ${MOST_TIMING_ADVANCE_SQUARES} squares with the most samples, and says the list was cut`, () => {
    const readings = Array.from({ length: MOST_TIMING_ADVANCE_SQUARES + 1 }, (_, index) => reading({ bin: SQUARE + index, sampleCount: index + 1 }));
    const { timingAdvanceSquares: squares, timingAdvanceSquaresTruncated } = timingAdvanceSquares(readings, [], [], asAdmin);

    expect(squares).toHaveLength(MOST_TIMING_ADVANCE_SQUARES);
    expect(squares.at(-1)?.samples).toBe(2);
    expect(timingAdvanceSquaresTruncated).toBe(true);
    expect(timingAdvanceSquares(readings.slice(1), [], [], asAdmin).timingAdvanceSquaresTruncated).toBe(false);
  });

  it("counts only the squares an editor may see towards the cut", () => {
    const readings = Array.from({ length: MOST_TIMING_ADVANCE_SQUARES + 1 }, (_, index) => reading({ bin: SQUARE + index }));
    const sightings = readings.slice(1).map((shown) => sighting({ bin: shown.bin }));

    expect(timingAdvanceSquares(readings, sightings, [], asEditor)).toMatchObject({ timingAdvanceSquaresTruncated: false });
    expect(timingAdvanceSquares(readings, sightings, [], asAdmin)).toMatchObject({ timingAdvanceSquaresTruncated: true });
  });
});

describe("whose evidence a site answers", () => {
  it("answers a group's member with its own grid, the lead's tested places and every member's cells", () => {
    const member = siteRecord({ id: 7311, group: { leadSiteId: 7310, memberSiteIds: [7310, 7311] } });

    expect(evidenceSourcesOf(member)).toEqual({ siteId: 7311, testedSiteId: 7310, cellSiteIds: [7310, 7311] });
  });

  it("answers a copy with its primary's evidence, under the primary's id", () => {
    const copy = siteRecord({ id: 9102, primarySiteId: 9101, copyOfObservedSiteId: 9101 });

    expect(evidenceSourcesOf(copy)).toEqual({ siteId: 9101, testedSiteId: 9101, cellSiteIds: [9101] });
  });
});
