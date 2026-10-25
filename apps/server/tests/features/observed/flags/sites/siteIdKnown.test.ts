import { describe, expect, it } from "vitest";

import type { RegisterLink } from "../../../../../src/features/observed/flags/sites/registerNumbers.js";
import { raiseSiteIdKnownFlag } from "../../../../../src/features/observed/flags/sites/siteIdKnown.js";
import { siteRecord } from "../../../../helpers/siteRecordFixtures.js";

const STATION_ID = 40122;

describe("siteIdKnown", () => {
  const station = { id: STATION_ID, operatorId: 2, hasPlaceholder: true };
  const site = siteRecord({ id: 6120, nodeId: 133362, status: "matched", matchedStationId: STATION_ID, operatorId: 2 });
  const link: RegisterLink = { observedSiteId: 6120, officialSiteId: 55120, operatorId: 2, siteId: "BT33362", isTaken: false };

  it("opens on a placeholder station whose register names one number", () => {
    expect(raiseSiteIdKnownFlag(station, [site], [link])).toEqual({
      kind: "siteIdKnown",
      subjectKey: `station:${STATION_ID}`,
      refs: { stationId: STATION_ID, observedSiteId: 6120 },
      evidence: { officialSiteId: 55120, enbid: 133362 },
      suggestion: { siteId: "BT33362" },
      measure: { siteId: "BT33362" },
    });
  });

  it.each([
    ["two numbers", [link, { ...link, officialSiteId: 55121, siteId: "BT33363" }]],
    ["a number another station has", [{ ...link, isTaken: true }]],
  ])("does not open for %s", (_case, links) => {
    expect(raiseSiteIdKnownFlag(station, [site], links)).toBeNull();
  });

  it("does not open on a station with a number of its own", () => {
    expect(raiseSiteIdKnownFlag({ ...station, hasPlaceholder: false }, [site], [link])).toBeNull();
  });
});
