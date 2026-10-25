import { describe, expect, it } from "vitest";

import {
  type Footprint,
  type MeasuredSquare,
  footprintsOf,
  raiseDecommissionedFlag,
} from "../../../../../src/features/observed/flags/cells/decommissioned.js";
import { type Polygon, quadkeyOf, tileAt } from "../../../../../src/features/observed/tiles/squares.js";

const MEASURED_SINCE = "2026-09-25";
const LAST_WEEK = "2026-10-19";
const FOOTPRINT: Polygon = [
  [
    [21.0, 52.22],
    [21.03, 52.22],
    [21.03, 52.24],
    [21.0, 52.24],
    [21.0, 52.22],
  ],
];
const QUIET_CELL = { cellId: 880345, stationId: 40077, observedCellId: 50211, lastSeenOn: "2026-07-01" };

function squaresInside(count: number, overrides: Partial<MeasuredSquare> = {}): MeasuredSquare[] {
  return Array.from({ length: count }, (_, index) => ({
    bin: quadkeyOf(tileAt({ latitude: 52.225 + 0.001 * (index % 4), longitude: 21.005 + 0.002 * Math.floor(index / 4) }, 18)),
    contributorBits: index % 2 === 0 ? 0b01n : 0b10n,
    lastSeenOn: LAST_WEEK,
    ...overrides,
  }));
}

describe("possiblyDecommissioned", () => {
  it("opens for a cell unseen for 100 days whose network and band two people measured in 12 squares of its footprint last week", () => {
    expect(raiseDecommissionedFlag(QUIET_CELL, [FOOTPRINT], squaresInside(12), { measuredSince: MEASURED_SINCE })).toEqual({
      kind: "possiblyDecommissioned",
      subjectKey: "cell:880345",
      refs: { cellId: 880345, stationId: 40077, observedCellId: 50211 },
      evidence: { lastSeenOn: "2026-07-01", networkMeasuredOn: LAST_WEEK, measuredSquareCount: 12 },
      suggestion: null,
      measure: { lastSeenOn: "2026-07-01", people: 2 },
    });
  });

  it.each([
    ["8 squares", squaresInside(8)],
    ["one person", squaresInside(12, { contributorBits: 0b01n })],
    ["squares last measured before the 30 days", squaresInside(12, { lastSeenOn: "2026-09-01" })],
    ["squares outside its footprint", squaresInside(12).map((square) => ({ ...square, bin: square.bin + 4 ** 12 }))],
  ])("does not open with %s", (_case, squares) => {
    expect(raiseDecommissionedFlag(QUIET_CELL, [FOOTPRINT], squares, { measuredSince: MEASURED_SINCE })).toBeNull();
  });

  it("does not open without a footprint", () => {
    expect(raiseDecommissionedFlag(QUIET_CELL, [], squaresInside(12), { measuredSince: MEASURED_SINCE })).toBeNull();
  });
});

describe("a cell's footprint", () => {
  const shape = (cellId: number, bandId: number): Footprint => ({
    cellId,
    stationId: 40077,
    rat: "LTE",
    bandId,
    observedCellId: cellId - 830_000,
    footprint: FOOTPRINT,
  });
  const neverSeen = { cellId: 880345, stationId: 40077, rat: "LTE" as const, bandId: 3 };

  it("is its matched observed cell's shape", () => {
    expect(footprintsOf(neverSeen, [shape(880345, 3), shape(880346, 3)])).toHaveLength(1);
  });

  it("is, for a cell never seen, the shapes of its station's other cells of that band", () => {
    expect(footprintsOf(neverSeen, [shape(880346, 3), shape(880347, 3), shape(880348, 20)])).toHaveLength(2);
  });

  it("is none when only cells of other bands were measured", () => {
    expect(footprintsOf(neverSeen, [shape(880348, 20)])).toEqual([]);
  });
});
