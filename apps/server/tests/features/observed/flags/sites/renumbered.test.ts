import { describe, expect, it } from "vitest";

import { type MatchedCellOfOurs, type NewSiteCell, raiseRenumberedFlag } from "../../../../../src/features/observed/flags/sites/renumbered.js";
import { BIALYSTOK, siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const STATION_ID = 40122;
const METERS_PER_DEGREE = 111_195;
const NEAR_THE_STATION = { latitude: BIALYSTOK.latitude + 40 / METERS_PER_DEGREE, longitude: BIALYSTOK.longitude };

describe("renumbered", () => {
  const quietBefore = "2026-10-11";
  const previous = siteRecord({ id: 6120, nodeId: 24400, status: "matched", matchedStationId: STATION_ID, lastSeenOn: "2026-10-01" });
  const renumberedSite = siteRecord({ id: 7310, nodeId: 24494, firstSeenOn: "2026-10-03" });
  const ours: MatchedCellOfOurs[] = [
    { cellId: 880345, clid: 1, channel: 1850, pci: 101 },
    { cellId: 880346, clid: 11, channel: 3150, pci: 101 },
  ];
  const candidate = (cells: readonly MatchedCellOfOurs[] = ours) => ({ previous, stationId: STATION_ID, station: NEAR_THE_STATION, cells });
  const newCell = (observedCellId: number, clid: number, channel: number, pci: number): NewSiteCell => ({
    observedCellId,
    cellKey: 24494 * 256 + clid,
    channel,
    pci,
  });

  it("opens on the new site when an eNB that went quiet has a new one beside it on its channels and PCIs, with the new ids", () => {
    const cells = [newCell(51001, 1, 1850, 101), newCell(51002, 12, 3150, 101)];

    expect(raiseRenumberedFlag(renumberedSite, cells, [candidate()], { quietBefore })).toMatchObject({
      kind: "renumbered",
      refs: { observedSiteId: 7310, stationId: STATION_ID },
      evidence: { previousObservedSiteId: 6120, alikeCellCount: 2 },
      suggestion: {
        cells: [
          { action: "update", id: 880345, enbid: 24494 },
          { action: "update", id: 880346, enbid: 24494, clid: 12 },
        ],
      },
    });
  });

  it("does not open when only one of three cells is alike", () => {
    const three = [...ours, { cellId: 880347, clid: 21, channel: 6300, pci: 214 }];

    expect(raiseRenumberedFlag(renumberedSite, [newCell(51001, 1, 1850, 101)], [candidate(three)], { quietBefore })).toBeNull();
  });

  it("does not open while the old site is still seen, nor for a new site seen long before it went quiet", () => {
    const cells = [newCell(51001, 1, 1850, 101), newCell(51002, 11, 3150, 101)];
    const stillSeen = { ...candidate(), previous: { ...previous, lastSeenOn: "2026-10-20" } };

    expect(raiseRenumberedFlag(renumberedSite, cells, [stillSeen], { quietBefore })).toBeNull();
    expect(raiseRenumberedFlag({ ...renumberedSite, firstSeenOn: "2026-08-01" }, cells, [candidate()], { quietBefore })).toBeNull();
  });
});
