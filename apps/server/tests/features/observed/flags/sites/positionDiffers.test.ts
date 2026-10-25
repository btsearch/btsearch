import { describe, expect, it } from "vitest";

import { raisePositionDiffersFlag } from "../../../../../src/features/observed/flags/sites/positionDiffers.js";
import { BIALYSTOK, shownEstimate, siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const STATION_ID = 40122;
const METERS_PER_DEGREE = 111_195;

function north(meters: number) {
  return { latitude: BIALYSTOK.latitude + meters / METERS_PER_DEGREE, longitude: BIALYSTOK.longitude };
}

describe("positionDiffers", () => {
  const matched = (uncertaintyM = 120) => siteRecord({ status: "matched", matchedStationId: STATION_ID, estimate: shownEstimate({ uncertaintyM }) });

  it("opens for a matched site whose clear fit lies 900 m from its station", () => {
    expect(raisePositionDiffersFlag(matched(), north(900))).toMatchObject({
      kind: "positionDiffers",
      refs: { observedSiteId: 7310, stationId: STATION_ID },
      evidence: { distanceMeters: 900, radiusMeters: 120 },
    });
  });

  it.each([
    ["at 250 m", matched(), north(250)],
    ["with a radius of 400 m", matched(400), north(900)],
    ["for a station without a location", matched(), null],
  ])("does not open %s", (_case, site, station) => {
    expect(raisePositionDiffersFlag(site, station)).toBeNull();
  });
});
