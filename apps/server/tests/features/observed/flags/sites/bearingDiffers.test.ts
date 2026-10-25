import { describe, expect, it } from "vitest";

import { type SectorCell, raiseBearingFlags } from "../../../../../src/features/observed/flags/sites/bearingDiffers.js";

const STATION_ID = 40122;

describe("bearingDiffers", () => {
  const cell = (overrides: Partial<SectorCell> = {}): SectorCell => ({
    sectorId: 9921,
    azimuth: 60,
    stationId: STATION_ID,
    cellId: 880345,
    observedCellId: 50211,
    observedSiteId: 6120,
    samples: 4000,
    people: 3,
    bearingDeg: 120,
    spreadDeg: 80,
    ...overrides,
  });

  it("opens one flag for a sector 60° off, decided by its best-measured cell", () => {
    const agreeing = cell({ cellId: 880346, observedCellId: 50212, samples: 900, bearingDeg: 62 });
    const flags = raiseBearingFlags([agreeing, cell()], new Set());

    expect(flags).toEqual([
      {
        kind: "bearingDiffers",
        subjectKey: "sector:9921",
        refs: { sectorId: 9921, stationId: STATION_ID, cellId: 880345, observedCellId: 50211, observedSiteId: 6120 },
        evidence: { bearingDegrees: 120, spreadDegrees: 80, azimuth: 60 },
        suggestion: null,
        measure: { azimuth: 60, people: 3 },
      },
    ]);
  });

  it("measures the difference around the circle", () => {
    expect(raiseBearingFlags([cell({ azimuth: 350, bearingDeg: 20 })], new Set())).toEqual([]);
  });

  it.each([
    ["the spread is 150°", [cell({ spreadDeg: 150 })], new Set<number>()],
    ["its site lies far from the station", [cell()], new Set([6120])],
  ])("does not open when %s", (_case, cells, offTheirStation) => {
    expect(raiseBearingFlags(cells, offTheirStation)).toEqual([]);
  });
});
