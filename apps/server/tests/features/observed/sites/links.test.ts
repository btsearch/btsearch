import { describe, expect, it } from "vitest";

import { linkSites, suggestStations } from "../../../../src/features/observed/sites/links.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { scriptNetwork, writes, written } from "../../../helpers/observedFixtures.js";

const STATION_A = 20;
const STATION_B = 21;
const TELEKOM = "26201";

describe("matched site links", () => {
  it("keep an LTE site on the station most of its LTE cells match, whatever the GSM cells attached to it match", async () => {
    dbMock.enqueueFor("select", "cell_matches", [
      { siteId: 5, siteRat: "LTE", cellRat: "LTE", matchedStationId: null, cellStationId: STATION_A, cellCount: 2 },
      { siteId: 5, siteRat: "LTE", cellRat: "LTE", matchedStationId: null, cellStationId: STATION_B, cellCount: 1 },
      { siteId: 5, siteRat: "LTE", cellRat: "GSM", matchedStationId: null, cellStationId: STATION_B, cellCount: 3 },
    ]);
    dbMock.enqueueFor("select", "site_links", [{ observedSiteId: 5, stationId: STATION_A, kind: "matched", linkedById: null }]);

    await linkSites(dbMock as unknown as DbTx, [5]);

    expect(writes()).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("link a station's own site by the GSM and UMTS cells on it", async () => {
    dbMock.enqueueFor("select", "cell_matches", [
      { siteId: 6, siteRat: null, cellRat: "GSM", matchedStationId: null, cellStationId: STATION_B, cellCount: 2 },
      { siteId: 6, siteRat: null, cellRat: "UMTS", matchedStationId: null, cellStationId: STATION_B, cellCount: 1 },
    ]);
    dbMock.enqueueFor("select", "site_links", []);
    dbMock.enqueueFor("insert", "site_links", []);

    await linkSites(dbMock as unknown as DbTx, [6]);

    expect(writes()).toEqual([["insert", "site_links", [{ observedSiteId: 6, stationId: STATION_B, kind: "matched" }]]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("suggested sites", () => {
  it("suggests the nearest station of the site's network inside the estimate's radius", async () => {
    const cell = { id: 1, plmn: TELEKOM, rat: "LTE" as const, cellKey: 123_456 * 256 + 1, observedSiteId: 5 };
    dbMock.enqueueFor("select", "site_links", []);
    scriptNetwork(TELEKOM, { countryCode: "DE", countryTools: [] });
    dbMock.enqueueFor("select", "site_estimates", [
      { siteId: 5, stationId: 21, operatorId: 9, distanceM: 50 },
      { siteId: 5, stationId: 20, operatorId: 1, distanceM: 120 },
    ]);
    dbMock.enqueueFor("insert", "site_links", []);

    await suggestStations(dbMock as unknown as DbTx, [cell]);

    expect(written("insert", "site_links")).toEqual([[{ observedSiteId: 5, stationId: 20, kind: "suggested" }]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
